const io = require("socket.io-client");

const USER_ID = process.argv[2] || "user1";
const NATIVE_LANGUAGE = process.argv[3] || "English";
const PRACTICE_LANGUAGE = process.argv[4] || "Spanish";
const ACTION = process.argv[5] || "start";

const socket = io("http://localhost:3000");

socket.on("connect", () => {
  console.log(`Connected as ${USER_ID} with socket id:`, socket.id);

  if (ACTION === "start") {
    socket.emit("start_matchmaking", {
      userId: USER_ID,
      nativeLanguage: NATIVE_LANGUAGE,
      practiceLanguage: PRACTICE_LANGUAGE
    });
  }

  if (ACTION === "next") {
    socket.emit("next_partner", {
      userId: USER_ID,
      nativeLanguage: NATIVE_LANGUAGE,
      practiceLanguage: PRACTICE_LANGUAGE
    });
  }

});

socket.on("queued", (data) => {
  console.log(`[${USER_ID}] queued:`, data);
});

socket.on("match_found", (data) => {
  console.log(`[${USER_ID}] matched with:`, data.partnerId);
});

socket.on("info", (data) => {
  console.log(`[${USER_ID}] info:`, data.message);
});

socket.on("disconnect", () => {
  console.log(`[${USER_ID}] disconnected`);
});