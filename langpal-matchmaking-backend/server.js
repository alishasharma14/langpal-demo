const express = require("express"); // for web server
const http = require("http");   // HTTP server
const cors = require("cors");   // Allows rquests from other origins
const { Server } = require("socket.io");    //Socket.IO for real - time communication
require("dotenv").config()  // Loads environment variables from .env

const supabase = require("./supabaseClient");
const useSupabase = process.env.SUPABASE_URL && process.env.SUPABASE_KEY;

const app = express();
app.use(cors());
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

// creates SOCKET.IO server and attaches to HTTP server
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// just to ensure that the server is running
app.get("/", (req, res) => {
    res.send("Matchmaking backend running.");
});

// each connected client gets its own socket object
io.on("connection", (socket) => {
    console.log("User connection:", socket.id);

    // HANDLE MATCHMAKING LOGIC
    socket.on("start_matchmaking", async ({ userId }) => {
        try {
            socket.userId = userId; // to track which user disconnected

            console.log(`Start matchmaking requested by ${userId}`);

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
                            socket_id: socket.id
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
                
                // look for the next available waiting user (oldest first)
                const { data: waitingUsers, error: waitingError } = await supabase
                    .from("waiting_queue")
                    .select("*")
                    .neq("user_id", userId)
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
                        partnerId: partner.user_id
                    });

                    io.to(partner.socket_id).emit("match_found", {
                        matchId: matchData[0].id,
                        partnerId: userId
                    });

                    logMatch(userId, partner.user_id, matchData[0].id);
                } else {

                    socket.emit("queued", { message: "Waiting for a partner..."});  // executes if no partner exists to be matched in the queue

                }
            } else {
                if (findQueuedUserIndex(userId) >= 0) {
                    socket.emit("info", { message: "You are already in the queue."});
                    return;
                }

                waitingQueue.push({
                    user_id: userId,
                    socket_id: socket.id,
                    created_at: Date.now()
                });
                logQueueJoin(userId, waitingQueue.length);

                const waitingUsers = waitingQueue
                    .filter((entry) => entry.user_id !== userId)
                    .sort((a, b) => a.created_at - b.created_at)
                    .slice(0, 1);

                if (waitingUsers.length > 0) {
                    const partner = waitingUsers[0];

                    removeQueuedUser(userId);
                    removeQueuedUser(partner.user_id);

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
                    socket.emit("queued", { message: "Waiting for a partner..."});
                }
            }

        } catch(error) {

            console.error(error);
            socket.emit("info", { message: "Server error." });

        }
    });
    
    // HANDLE NEXT PARTNER TO BE MATCHED LOGIC
    socket.on("next_partner", async ({ userId }) => {
        try {
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
                            socket_id: socket.id
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
            } else {
                const activeMatch = findActiveMatch(userId);

                if (activeMatch) {
                    activeMatch.status = "ended";
                }

                removeQueuedUser(userId);

                waitingQueue.push({
                    user_id: userId,
                    socket_id: socket.id,
                    created_at: Date.now()
                });
                logQueueRejoin(userId, waitingQueue.length);
            }
            
            // emit queued back to the client
            socket.emit("queued", { message: "Re-entered queue"});

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

                    await supabase
                        .from("matches")
                        .update({ status: "ended" })
                        .eq("id", match.id);

                }
            } else {
                removeQueuedUser(userId);

                const activeMatch = findActiveMatch(userId);

                if (activeMatch) {
                    activeMatch.status = "ended";
                }
            }
        } catch (error) {

            console.error(error);

        }
    });
});

const PORT = process.env.PORT || 3000;

// starts backend on the chosen port
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
