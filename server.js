// server/server.js
const path = require("path");
const fs = require("fs");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// serve static files from client folder
app.use(express.static(path.join(__dirname, "..", "client")));

// ====== GLOBAL CANVAS STATE ======
let operations = [];
let undoneStack = [];
const DATA_PATH = path.join(__dirname, "canvas_state.json");

// try loading saved state at startup
if (fs.existsSync(DATA_PATH)) {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
    if (Array.isArray(data)) operations = data;
    console.log(`Loaded ${operations.length} saved operations.`);
  } catch (err) {
    console.warn("Failed to load saved canvas:", err.message);
  }
}

// ====== SOCKET.IO HANDLERS ======
io.on("connection", (socket) => {
  console.log("connected:", socket.id);

  // assign user color + meta
  socket.userMeta = { id: socket.id, color: assignColor(socket.id) };

  // send initial data to this user
  socket.emit("init", {
    ops: operations,
    users: getUsers(),
    me: socket.userMeta,
  });

  // broadcast new user join
  socket.broadcast.emit("user-join", socket.userMeta);

  // ====== DRAW EVENTS ======
  socket.on("stroke-part", (part) => {
    socket.broadcast.emit("stroke-part", { userId: socket.id, part });
  });

  socket.on("stroke-end", (op) => {
    op.userId = socket.id;
    op.id = `op_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    op.timestamp = Date.now();
    operations.push(op);
    undoneStack = [];
    io.emit("op-added", op);
  });

  // ====== HISTORY COMMANDS ======
  socket.on("undo", () => {
    if (!operations.length) return;
    const removed = operations.pop();
    undoneStack.push(removed);
    io.emit("op-removed", { id: removed.id });
  });

  socket.on("redo", () => {
    if (!undoneStack.length) return;
    const restored = undoneStack.pop();
    operations.push(restored);
    io.emit("op-added", restored);
  });

  socket.on("clear", () => {
    operations = [];
    undoneStack = [];
    io.emit("clear");
  });

  // ====== CURSOR UPDATES ======
  socket.on("cursor", (pos) => {
    socket.broadcast.emit("cursor", { userId: socket.id, ...pos });
  });

  // ====== SAVE / LOAD ======
  socket.on("save-canvas", () => {
    try {
      fs.writeFileSync(DATA_PATH, JSON.stringify(operations, null, 2));
      socket.emit("save-complete", { ok: true });
      console.log(`Canvas saved (${operations.length} ops).`);
    } catch (err) {
      console.error("Save failed:", err);
      socket.emit("save-complete", { ok: false, error: err.message });
    }
  });

  socket.on("load-canvas", () => {
    try {
      if (fs.existsSync(DATA_PATH)) {
        const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
        operations = Array.isArray(data) ? data : [];
        io.emit("init", {
          ops: operations,
          users: getUsers(),
          me: socket.userMeta,
        });
        console.log(`Canvas loaded (${operations.length} ops).`);
      } else {
        socket.emit("save-complete", { ok: false, error: "No saved file." });
      }
    } catch (err) {
      console.error("Load failed:", err);
    }
  });

  // ====== DISCONNECT ======
  socket.on("disconnect", () => {
    console.log("disconnected:", socket.id);
    io.emit("user-leave", socket.userMeta);
  });
});

// ====== HELPERS ======
function assignColor(id) {
  const palette = [
    "#2B6CB0",
    "#38A169",
    "#DD6B20",
    "#D53F8C",
    "#805AD5",
    "#E53E3E",
    "#0BC5EA",
  ];
  const idx = Math.abs(hashCode(id)) % palette.length;
  return palette[idx];
}
function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}
function getUsers() {
  return Array.from(io.sockets.sockets.values()).map((s) => s.userMeta);
}

// ====== START SERVER ======
server.listen(PORT, () =>
  console.log(`✅ Server running at http://localhost:${PORT}`)
);
