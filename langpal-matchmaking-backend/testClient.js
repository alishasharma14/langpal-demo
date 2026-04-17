const { io } = require("socket.io-client");

const USER_ID = process.argv[2] || "user1";
const ACTION = process.argv[3] || "start";

const socket = io("http://localhost:3000");

socket.on("connect", () => {
  console.log(`Connected as ${USER_ID} with socket id:`, socket.id);

  if (ACTION === "start") {
    socket.emit("start_matchmaking", { userId: USER_ID });
  }

  if (ACTION === "next") {
    socket.emit("next_partner", { userId: USER_ID });
  }

});

socket.on("queued", (data) => {
  console.log(`[${USER_ID}] queued:`, data.message);
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