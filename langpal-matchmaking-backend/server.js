require("dotenv").config();  // Loads environment variables from .env

const express = require("express"); // For web server
const http = require("http");   // HTTP server
const cors = require("cors");   // Allows rquests from other origins
const { Server } = require("socket.io");    // Socket.IO for real - time communication
const authRoutes = require("./routes/auth");    // Import authentication routes

const supabase = require("./supabaseClient");
const useSupabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY;

const ALLOWED_ORIGINS = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : [];

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : true }));
app.use(express.json());
app.use("/auth", authRoutes);
const server = http.createServer(app);

const waitingQueue = [];
const matches = [];
let nextMatchId = 1;

function logQueueJoin(userId, queueLength) {
    console.log(`[QUEUE] User ${userId} joined. Queue length: ${queueLength}`);
}

function logQueueRejoin(userId, queueLength) {
    console.log(`[QUEUE] User ${userId} re-added to queue. Queue length: ${queueLength}`);
}

function logMatch(userId, partnerId, roomId) {
    console.log(`[MATCH] ${userId} matched with ${partnerId} in room ${roomId}`);
}

function logNext(userId) {
    console.log(`[NEXT] User ${userId} requested next partner`);
}

function logDisconnect(userId) {
    console.log(`[DISCONNECT] User ${userId} left`);
}

function findQueuedUserIndex(userId) {
    return waitingQueue.findIndex((entry) => entry.user_id === userId);
}

function removeQueuedUser(userId) {
    const index = findQueuedUserIndex(userId);

    if (index >= 0) {
        waitingQueue.splice(index, 1);
    }
}

function findActiveMatch(userId) {
    return matches.find(
        (match) =>
            match.status === "active" &&
            (match.user1_id === userId || match.user2_id === userId)
    );
}

function getFallbackDisplayName(userId) {
    return userId ? `User ${String(userId).slice(0, 8)}` : "Partner";
}

function setSocketProfile(socket, { userId, displayName }) {
    socket.userId = userId;
    socket.displayName = displayName || getFallbackDisplayName(userId);
}

function findSocketByUserId(userId) {
    return Array.from(io.sockets.sockets.values()).find(
        (connectedSocket) => connectedSocket.userId === userId
    );
}

async function getDisplayName(userId, socket) {
    if (socket?.displayName) return socket.displayName;

    if (useSupabase) {
        const { data, error } = await supabase
            .from("users")
            .select("email")
            .eq("id", userId)
            .maybeSingle();

        if (!error && data?.email) return data.email;
    }

    return getFallbackDisplayName(userId);
}

async function notifyPartnerDisconnected(match, leaverId, leaverSocket) {
    if (!match) return;

    const partnerId = match.user1_id === leaverId ? match.user2_id : match.user1_id;
    const partnerSocket = findSocketByUserId(partnerId);
    if (!partnerSocket) return;

    partnerSocket.emit("partner_disconnected", {
        partnerId: leaverId,
        partnerName: await getDisplayName(leaverId, leaverSocket)
    });
}

function countPracticeLanguageWaiters(entry) {
    return waitingQueue.filter(
        (queuedUser) =>
            queuedUser.user_id !== entry.user_id &&
            queuedUser.practiceLanguage === entry.practiceLanguage
    ).length;
}

function emitInMemoryQueueCounts() {
    waitingQueue.forEach((entry) => {
        io.to(entry.socket_id).emit("queue_update", {
            count: countPracticeLanguageWaiters(entry)
        });
    });
}

async function countSupabasePracticeLanguageWaiters(entry) {
    let query = supabase
        .from("waiting_queue")
        .select("*", { count: "exact", head: true })
        .neq("user_id", entry.user_id);

    if (entry.practiceLanguage) {
        query = query.eq("practice_language", entry.practiceLanguage);
    }

    const { count, error } = await query;
    if (error) {
        console.error("Queue count error:", error);
        return 0;
    }

    return count ?? 0;
}

async function emitSupabaseQueueCounts() {
    const { data: queuedUsers, error } = await supabase
        .from("waiting_queue")
        .select("user_id, socket_id, practice_language");

    if (error) {
        console.error("Queue update query error:", error);
        return;
    }

    await Promise.all((queuedUsers || []).map(async (entry) => {
        const count = await countSupabasePracticeLanguageWaiters({
            user_id: entry.user_id,
            practiceLanguage: entry.practice_language
        });

        io.to(entry.socket_id).emit("queue_update", { count });
    }));
}

// creates SOCKET.IO server and attaches to HTTP server
const io = new Server(server, {
    cors: {
        origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : true,
        methods: ["GET", "POST"]
    }
});

// just to ensure that the server is running
// Root route removed to allow static frontend serving

// each connected client gets its own socket object
io.on("connection", (socket) => {
    console.log("User connection:", socket.id);

    // HANDLE MATCHMAKING LOGIC
    socket.on("start_matchmaking", async ({ userId, displayName, nativeLanguage, practiceLanguage }) => {
        try {
            setSocketProfile(socket, { userId, displayName }); // to track which user disconnected

            console.log(`Start matchmaking requested by ${userId} (Native: ${nativeLanguage}, Practice: ${practiceLanguage})`);

            if (useSupabase) {
                // check if user already exists in the queue
                const { data: existingUser, error: existingError } = await supabase
                    .from("waiting_queue")
                    .select("*")
                    .eq("user_id", userId);
                
                if (existingError) {
                    console.error("Existing user query error:", existingError);
                    socket.emit("info", { message: "Error checking queue." });
                    return;
                }
                
                // stops duplicate queue entries
                if (existingUser.length > 0) {
                    socket.emit("info", { message: "You are already in the queue."});
                    return;
                }

                // add user to the queue
                const { error: insertQueueError } = await supabase
                    .from("waiting_queue")
                    .insert([
                        {
                            user_id: userId,
                            socket_id: socket.id,
                            display_name: socket.displayName,
                            native_language: nativeLanguage,
                            practice_language: practiceLanguage
                        }
                    ]);
                
                if (insertQueueError) {
                    console.error("Queue insert error:", insertQueueError);
                    socket.emit("info", { message: "Error joining queue." });
                    return;
                }

                const { count: queueCount, error: queueCountError } = await supabase
                    .from("waiting_queue")
                    .select("*", { count: "exact", head: true });

                if (queueCountError) {
                    console.error("Queue count error:", queueCountError);
                } else {
                    logQueueJoin(userId, queueCount ?? 0);
                }
                await emitSupabaseQueueCounts();
                
                // look for the next available waiting user (oldest first)
                const { data: waitingUsers, error: waitingError } = await supabase
                    .from("waiting_queue")
                    .select("*")
                    .neq("user_id", userId)
                    .eq("native_language", practiceLanguage)
                    .eq("practice_language", nativeLanguage)
                    .order("created_at", { ascending: true })
                    .limit(1);
                
                if (waitingError) {
                    console.error("Waiting users query error:", waitingError);
                    socket.emit("info", { message: "Error finding partner." });
                    return;
                }
                
                // implemented if partner exists
                if (waitingUsers.length > 0) {

                    const partner = waitingUsers[0];

                    // remove both users from the waiting_queue
                    await supabase.from("waiting_queue").delete().eq("user_id", userId);
                    await supabase.from("waiting_queue").delete().eq("user_id", partner.user_id);
                    await emitSupabaseQueueCounts();

                    // performs the actual matchmaking between the users
                    const { data: matchData, error: matchError } = await supabase
                        .from("matches")
                        .insert([
                            {
                                user1_id: userId,
                                user2_id: partner.user_id,
                                status: "active"
                            }
                        ])
                        .select();
                    
                    if (matchError) {
                        console.error("Match insert error:", matchError);
                        socket.emit("info", { message: "Error creating match." });
                        return;
                    }

                    if (!matchData || matchData.length === 0) {
                        console.error("No match data returned from Supabase.");
                        socket.emit("info", { message: "Match creation failed." });
                        return;
                    }
                    
                    // send the matched partner to both the users
                    socket.emit("match_found", {
                        matchId: matchData[0].id,
                        partnerId: partner.user_id,
                        partnerName: partner.display_name
                    });

                    io.to(partner.socket_id).emit("match_found", {
                        matchId: matchData[0].id,
                        partnerId: userId,
                        partnerName: socket.displayName
                    });

                    logMatch(userId, partner.user_id, matchData[0].id);
                } else {

                    socket.emit("queued", {
                        message: "Waiting for a partner...",
                        count: await countSupabasePracticeLanguageWaiters({
                            user_id: userId,
                            practiceLanguage
                        })
                    });  // executes if no partner exists to be matched in the queue

                }
            } else {
                if (findQueuedUserIndex(userId) >= 0) {
                    socket.emit("info", { message: "You are already in the queue."});
                    return;
                }

                waitingQueue.push({
                    user_id: userId,
                    socket_id: socket.id,
                    displayName: socket.displayName,
                    nativeLanguage,
                    practiceLanguage,
                    created_at: Date.now()
                });
                logQueueJoin(userId, waitingQueue.length);
                emitInMemoryQueueCounts();
                
                console.log(`[DEBUG] Queue currently has ${waitingQueue.length} users. Looking for match...`);
                console.log(`[DEBUG] Current user is seeking someone whose Native is ${practiceLanguage} and Practice is ${nativeLanguage}`);

                const waitingUsers = waitingQueue
                    .filter((entry) => {
                        const isNotSelf = entry.user_id !== userId;
                        const nativeMatches = entry.nativeLanguage === practiceLanguage;
                        const practiceMatches = entry.practiceLanguage === nativeLanguage;
                        
                        console.log(`[DEBUG] Comparing against user ${entry.user_id} (Native: ${entry.nativeLanguage}, Practice: ${entry.practiceLanguage})`);
                        console.log(`[DEBUG] -> isNotSelf: ${isNotSelf}, nativeMatches: ${nativeMatches}, practiceMatches: ${practiceMatches}`);
                        
                        return isNotSelf && nativeMatches && practiceMatches;
                    })
                    .sort((a, b) => a.created_at - b.created_at)
                    .slice(0, 1);

                if (waitingUsers.length > 0) {
                    const partner = waitingUsers[0];

                    removeQueuedUser(userId);
                    removeQueuedUser(partner.user_id);
                    emitInMemoryQueueCounts();

                    const matchData = [
                        {
                            id: String(nextMatchId++),
                            user1_id: userId,
                            user2_id: partner.user_id,
                            status: "active"
                        }
                    ];

                    matches.push(matchData[0]);

                    socket.emit("match_found", {
                        matchId: matchData[0].id,
                        partnerId: partner.user_id
                    });

                    io.to(partner.socket_id).emit("match_found", {
                        matchId: matchData[0].id,
                        partnerId: userId
                    });

                    logMatch(userId, partner.user_id, matchData[0].id);
                } else {
                    socket.emit("queued", {
                        message: "Waiting for a partner...",
                        count: countPracticeLanguageWaiters({
                            user_id: userId,
                            practiceLanguage
                        })
                    });
                }
            }

        } catch(error) {

            console.error(error);
            socket.emit("info", { message: "Server error." });

        }
    });
    
    // HANDLE NEXT PARTNER TO BE MATCHED LOGIC
    socket.on("next_partner", async ({ userId, displayName, nativeLanguage, practiceLanguage }) => {
        try {
            setSocketProfile(socket, { userId, displayName });
            logNext(userId);
            
            if (useSupabase) {
                // find the current active match
                const { data: activeMatches, error: activeMatchesError } = await supabase
                    .from("matches")
                    .select("*")
                    .eq("status", "active")
                    .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);
                
                if (activeMatchesError) {
                    console.error("Active matches query error:", activeMatchesError);
                    socket.emit("info", { message: "Error finding current match." });
                    return;
                }
                
                // if found, change the match status to ended
                if (activeMatches.length > 0) {
                    await notifyPartnerDisconnected(activeMatches[0], userId, socket);
                    
                    await supabase
                        .from("matches")
                        .update({ status: "ended" })
                        .eq("id", activeMatches[0].id);
                }

                // remove the user from the waiting_queue just to be sure
                await supabase
                    .from("waiting_queue")
                    .delete()
                    .eq("user_id", userId);
                
                // add the user back to the waiting queue
                const { error: requeueInsertError } = await supabase
                    .from("waiting_queue")
                    .insert([
                        {
                            user_id: userId,
                            socket_id: socket.id,
                            display_name: socket.displayName,
                            native_language: nativeLanguage,
                            practice_language: practiceLanguage
                        }
                    ]);
                
                if (requeueInsertError) {
                    console.error("Requeue insert error:", requeueInsertError);
                    socket.emit("info", { message: "Error re-entering queue." });
                    return;
                }

                const { count: queueCount, error: queueCountError } = await supabase
                    .from("waiting_queue")
                    .select("*", { count: "exact", head: true });

                if (queueCountError) {
                    console.error("Queue count error:", queueCountError);
                } else {
                    logQueueRejoin(userId, queueCount ?? 0);
                }
                await emitSupabaseQueueCounts();

                const { data: waitingUsers, error: waitingError } = await supabase
                    .from("waiting_queue")
                    .select("*")
                    .neq("user_id", userId)
                    .eq("native_language", practiceLanguage)
                    .eq("practice_language", nativeLanguage)
                    .order("created_at", { ascending: true })
                    .limit(1);

                if (waitingError) {
                    console.error("Waiting users query error:", waitingError);
                    socket.emit("info", { message: "Error finding partner." });
                    return;
                }

                if (waitingUsers.length > 0) {
                    const partner = waitingUsers[0];

                    await supabase.from("waiting_queue").delete().eq("user_id", userId);
                    await supabase.from("waiting_queue").delete().eq("user_id", partner.user_id);
                    await emitSupabaseQueueCounts();

                    const { data: matchData, error: matchError } = await supabase
                        .from("matches")
                        .insert([
                            {
                                user1_id: userId,
                                user2_id: partner.user_id,
                                status: "active"
                            }
                        ])
                        .select();

                    if (matchError) {
                        console.error("Match insert error:", matchError);
                        socket.emit("info", { message: "Error creating match." });
                        return;
                    }

                    if (!matchData || matchData.length === 0) {
                        console.error("No match data returned from Supabase.");
                        socket.emit("info", { message: "Match creation failed." });
                        return;
                    }

                    socket.emit("match_found", {
                        matchId: matchData[0].id,
                        partnerId: partner.user_id,
                        partnerName: partner.display_name
                    });

                    io.to(partner.socket_id).emit("match_found", {
                        matchId: matchData[0].id,
                        partnerId: userId,
                        partnerName: socket.displayName
                    });

                    logMatch(userId, partner.user_id, matchData[0].id);
                } else {
                    socket.emit("queued", {
                        message: "Re-entered queue",
                        count: await countSupabasePracticeLanguageWaiters({
                            user_id: userId,
                            practiceLanguage
                        })
                    });
                }
            } else {
                const activeMatch = findActiveMatch(userId);

                if (activeMatch) {
                    await notifyPartnerDisconnected(activeMatch, userId, socket);
                    activeMatch.status = "ended";
                }

                removeQueuedUser(userId);

                waitingQueue.push({
                    user_id: userId,
                    socket_id: socket.id,
                    displayName: socket.displayName,
                    nativeLanguage,
                    practiceLanguage,
                    created_at: Date.now()
                });
                logQueueRejoin(userId, waitingQueue.length);
                emitInMemoryQueueCounts();

                // Note: The actual matching logic happens when another user joins, 
                // but we should probably trigger a match check here too!
                const waitingUsers = waitingQueue
                    .filter((entry) => 
                        entry.user_id !== userId && 
                        entry.nativeLanguage === practiceLanguage && 
                        entry.practiceLanguage === nativeLanguage
                    )
                    .sort((a, b) => a.created_at - b.created_at)
                    .slice(0, 1);
                
                if (waitingUsers.length > 0) {
                    const partner = waitingUsers[0];

                    removeQueuedUser(userId);
                    removeQueuedUser(partner.user_id);
                    emitInMemoryQueueCounts();

                    const matchData = [
                        {
                            id: String(nextMatchId++),
                            user1_id: userId,
                            user2_id: partner.user_id,
                            status: "active"
                        }
                    ];

                    matches.push(matchData[0]);

                    socket.emit("match_found", {
                        matchId: matchData[0].id,
                        partnerId: partner.user_id
                    });

                    io.to(partner.socket_id).emit("match_found", {
                        matchId: matchData[0].id,
                        partnerId: userId
                    });

                    logMatch(userId, partner.user_id, matchData[0].id);
                } else {
                    // emit queued back to the client if no match found
                    socket.emit("queued", {
                        message: "Re-entered queue",
                        count: countPracticeLanguageWaiters({
                            user_id: userId,
                            practiceLanguage
                        })
                    });
                }
            }
        } catch(error) {

            console.error(error);
            socket.emit("info", { message: "Server error." });
        }
    });

    // HANDLE DISCONNECT WHEN CLIENT CONNECTION CLOSES
    socket.on("disconnect", async () => {

        try {

            // gets the userID from socket.userId
            const userId = socket.userId;

            if (!userId) return;
            logDisconnect(userId);

            if (useSupabase) {
                // remove them from the waiting_queue just to be sure
                await supabase
                    .from("waiting_queue")
                    .delete()
                    .eq("user_id", userId);
                
                // check to see if the user who disconnected had an active match
                const { data: activeMatches } = await supabase
                    .from("matches")
                    .select("*")
                    .eq("status", "active")
                    .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);
                
                // if there was an active match, then update the match status to ended
                if (activeMatches.length > 0) {

                    const match = activeMatches[0];
                    await notifyPartnerDisconnected(match, userId, socket);

                    await supabase
                        .from("matches")
                        .update({ status: "ended" })
                        .eq("id", match.id);

                }
            } else {
                removeQueuedUser(userId);
                emitInMemoryQueueCounts();

                const activeMatch = findActiveMatch(userId);

                if (activeMatch) {
                    await notifyPartnerDisconnected(activeMatch, userId, socket);
                    activeMatch.status = "ended";
                }
            }
        } catch (error) {

            console.error(error);

        }
    });
});

const PORT = process.env.PORT || 3000;

// ============================================
// WEBRTC SIGNALING LOGIC (Native WS)
// ============================================
const WebSocket = require('ws');
const wss = new WebSocket.Server({ server, path: '/webrtc' });
const rooms = new Map();

wss.on('connection', (ws) => {
  let currentRoom = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      console.warn('Invalid JSON received, ignoring.');
      return;
    }

    const { type, roomId } = msg;

    if (type === 'join') {
      currentRoom = roomId;
      if (!rooms.has(roomId)) rooms.set(roomId, new Set());
      const room = rooms.get(roomId);
      room.add(ws);
      console.log(`[WEBRTC ${roomId}] peer joined (${room.size} in room)`);

      ws.send(JSON.stringify({ type: 'joined', roomId, peerCount: room.size }));

      if (room.size > 1) {
        room.forEach((peer) => {
          if (peer !== ws && peer.readyState === WebSocket.OPEN) {
            peer.send(JSON.stringify({ type: 'peer-ready', roomId }));
          }
        });
      }
      return;
    }

    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    room.forEach((peer) => {
      if (peer !== ws && peer.readyState === WebSocket.OPEN) {
        peer.send(raw.toString());
      }
    });
  });

  ws.on('close', () => {
    if (currentRoom) {
      const room = rooms.get(currentRoom);
      if (room) {
        room.delete(ws);
        console.log(`[WEBRTC ${currentRoom}] peer left (${room.size} remaining)`);
        room.forEach((peer) => {
          if (peer.readyState === WebSocket.OPEN) {
            peer.send(JSON.stringify({ type: 'peer-left', roomId: currentRoom }));
          }
        });
        if (room.size === 0) rooms.delete(currentRoom);
      }
    }
  });

  ws.on('error', (err) => console.error('WebSocket error:', err));
});

// Serve the frontend static files if they exist (for production single-deployment)
const path = require('path');
const frontendPath = path.join(__dirname, '../basic-ui/dist');
app.use(express.static(frontendPath));

// Catch-all route to serve the React app
app.get('/*path', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// starts backend on the chosen port
server.listen(PORT, () => {
    console.log(`Unified Server running on port ${PORT}`);
});
