// client/canvas.js
// Final optimized version — Safari-safe scaling, brush/eraser, sync, undo/redo, save/load, FPS metrics

const socket = io();
console.log("socket connecting...");

const canvas = document.getElementById("drawing");
const ctx = canvas.getContext("2d");
const cursorsLayer = document.getElementById("cursors");
const userListEl = document.getElementById("user-list");

// ===== CANVAS SETUP =====
let W = 0, H = 0;
let ops = [];
let offscreen = document.createElement("canvas");
let offctx = offscreen.getContext("2d");

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();

  // ✅ Safari-safe scaling: 1:1 logical to CSS pixels
  canvas.width = rect.width;
  canvas.height = rect.height;
  offscreen.width = rect.width;
  offscreen.height = rect.height;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  offctx.setTransform(1, 0, 0, 1, 0, 0);

  W = rect.width;
  H = rect.height;
  redraw();
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// ===== TOOLBAR ELEMENTS =====
const colorEl = document.getElementById("color");
const widthEl = document.getElementById("width");
const brushBtn = document.getElementById("brush");
const eraserBtn = document.getElementById("eraser");
const undoBtn = document.getElementById("undo");
const redoBtn = document.getElementById("redo");
const clearBtn = document.getElementById("clear");
const saveBtn = document.getElementById("save");
const loadBtn = document.getElementById("load");

let localColor = colorEl.value;
let localWidth = +widthEl.value;
let currentTool = "brush";

colorEl.onchange = () => (localColor = colorEl.value);
widthEl.oninput = () => (localWidth = +widthEl.value);
undoBtn.onclick = () => socket.emit("undo");
redoBtn.onclick = () => socket.emit("redo");
clearBtn.onclick = () => socket.emit("clear");

function setTool(tool) {
  currentTool = tool;
  if (tool === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    eraserBtn.style.fontWeight = "bold";
    brushBtn.style.fontWeight = "normal";
  } else {
    ctx.globalCompositeOperation = "source-over";
    brushBtn.style.fontWeight = "bold";
    eraserBtn.style.fontWeight = "normal";
  }
}
brushBtn.onclick = () => setTool("brush");
eraserBtn.onclick = () => setTool("eraser");
setTool("brush");

// ===== SAVE / LOAD =====
saveBtn.onclick = () => socket.emit("save-canvas");
loadBtn.onclick = () => socket.emit("load-canvas");
socket.on("save-complete", (res) =>
  alert(res.ok ? "✅ Canvas saved!" : "❌ Save failed: " + res.error)
);

// ===== DRAWING LOGIC =====
let drawing = false;
let lastPoint = null;
let strokePoints = [];
let lastEmit = 0;

function getPos(e) {
  const t = e.touches ? e.touches[0] : e;
  const r = canvas.getBoundingClientRect();
  return { x: t.clientX - r.left, y: t.clientY - r.top, t: Date.now() };
}
function drawDot(ctxObj, p, color, w) {
  ctxObj.fillStyle = color;
  ctxObj.beginPath();
  ctxObj.arc(p.x, p.y, Math.max(1, w / 2), 0, Math.PI * 2);
  ctxObj.fill();
}
function drawQuad(ctxObj, a, b, color, w) {
  ctxObj.strokeStyle = color;
  ctxObj.lineWidth = w;
  ctxObj.lineCap = "round";
  ctxObj.lineJoin = "round";
  ctxObj.beginPath();
  ctxObj.moveTo(a.x, a.y);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  ctxObj.quadraticCurveTo(a.x, a.y, mx, my);
  ctxObj.stroke();
}

function beginDraw(e) {
  e.preventDefault();
  drawing = true;
  strokePoints = [];
  lastPoint = getPos(e);
  strokePoints.push(lastPoint);
  drawDot(ctx, lastPoint, localColor, localWidth);
  socket.emit("stroke-part", {
    pts: [lastPoint],
    color: localColor,
    width: localWidth,
    tool: currentTool,
  });
  socket.emit("cursor", { x: lastPoint.x, y: lastPoint.y, color: localColor });
}
function moveDraw(e) {
  if (!drawing) return;
  e.preventDefault();
  const p = getPos(e);
  strokePoints.push(p);
  drawQuad(ctx, lastPoint, p, localColor, localWidth);
  lastPoint = p;
  const now = Date.now();
  if (now - lastEmit > 25) {
    socket.emit("stroke-part", {
      pts: strokePoints.slice(-4),
      color: localColor,
      width: localWidth,
      tool: currentTool,
    });
    lastEmit = now;
  }
  socket.emit("cursor", { x: p.x, y: p.y, color: localColor });
}
function endDraw(e) {
  if (!drawing) return;
  drawing = false;
  const op = {
    type: currentTool === "eraser" ? "erase" : "stroke",
    points: strokePoints,
    color: localColor,
    width: localWidth,
  };
  ops.push(op);
  socket.emit("stroke-end", op);
  strokePoints = [];
}

canvas.addEventListener("mousedown", beginDraw);
canvas.addEventListener("mousemove", moveDraw);
window.addEventListener("mouseup", endDraw);
canvas.addEventListener("touchstart", beginDraw, { passive: false });
canvas.addEventListener("touchmove", moveDraw, { passive: false });
window.addEventListener("touchend", endDraw);

// ===== REPLAY & OFFSCREEN BUFFER =====
function redraw() {
  offctx.clearRect(0, 0, W, H);
  for (const op of ops) drawToBuffer(op);
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(offscreen, 0, 0);
}
function drawToBuffer(op) {
  if (!op.points || !op.points.length) return;
  offctx.globalCompositeOperation =
    op.type === "erase" ? "destination-out" : "source-over";
  offctx.strokeStyle = op.color;
  offctx.lineWidth = op.width;
  offctx.lineCap = "round";
  offctx.lineJoin = "round";
  drawDot(offctx, op.points[0], op.color, op.width);
  for (let i = 1; i < op.points.length; i++)
    drawQuad(offctx, op.points[i - 1], op.points[i], op.color, op.width);
}

// ===== SOCKET EVENTS =====
socket.on("connect", () => console.log("socket connected", socket.id));
socket.on("init", (data) => {
  ops = data.ops || [];
  redraw();
  updateUserList(data.users || []);
});
socket.on("op-added", (op) => {
  ops.push(op);
  drawToBuffer(op);
  ctx.drawImage(offscreen, 0, 0);
});
socket.on("op-removed", ({ id }) => {
  ops = ops.filter((o) => o.id !== id);
  redraw();
});
socket.on("clear", () => {
  ops = [];
  offctx.clearRect(0, 0, W, H);
  ctx.clearRect(0, 0, W, H);
});
socket.on("stroke-part", ({ userId, part }) => {
  if (userId === socket.id) return;
  const pts = part.pts || [];
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation =
    part.tool === "eraser" ? "destination-out" : "source-over";
  for (let i = 1; i < pts.length; i++)
    drawQuad(ctx, pts[i - 1], pts[i], part.color, part.width);
  ctx.globalCompositeOperation = prev;
});

// ===== CURSORS + USERS =====
const cursorEls = {};
function renderCursor(id, x, y, color) {
  let el = cursorEls[id];
  if (!el) {
    el = document.createElement("div");
    el.className = "cursor";
    el.style.background = color || "#333";
    el.textContent = id.slice(0, 4);
    cursorsLayer.appendChild(el);
    cursorEls[id] = el;
  }
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}
function removeCursor(id) {
  if (cursorEls[id]) {
    cursorEls[id].remove();
    delete cursorEls[id];
  }
}
socket.on("cursor", (data) => {
  if (!data || data.userId === socket.id) return;
  renderCursor(data.userId, data.x, data.y, data.color);
});
socket.on("user-join", (meta) => addUser(meta));
socket.on("user-leave", (meta) => {
  removeCursor(meta.id);
  removeUser(meta.id);
});

function updateUserList(users) {
  userListEl.textContent = users.map((u) => u.id.slice(0, 4)).join(", ");
}
function addUser(meta) {
  const ids = (userListEl.textContent || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const short = meta.id.slice(0, 4);
  if (!ids.includes(short)) ids.push(short);
  userListEl.textContent = ids.join(", ");
}
function removeUser(id) {
  const short = id.slice(0, 4);
  const ids = (userListEl.textContent || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => x !== short);
  userListEl.textContent = ids.join(", ");
}

// ===== METRICS (FPS + LATENCY) =====
const metrics = document.createElement("div");
metrics.style.position = "fixed";
metrics.style.right = "8px";
metrics.style.bottom = "8px";
metrics.style.background = "rgba(0,0,0,0.6)";
metrics.style.color = "#fff";
metrics.style.padding = "4px 8px";
metrics.style.borderRadius = "6px";
metrics.style.fontSize = "12px";
document.body.appendChild(metrics);

let frameCount = 0;
let lastTime = performance.now();
let fps = 0;
let latency = 0;

function pingServer() {
  const t0 = Date.now();
  socket.emit("ping-test");
  socket.once("pong-test", () => {
    latency = Date.now() - t0;
  });
}
socket.on("connect", () => setInterval(pingServer, 2000));
socket.on("ping-test", () => socket.emit("pong-test"));

function measureFPS() {
  frameCount++;
  const now = performance.now();
  if (now - lastTime >= 1000) {
    fps = frameCount;
    frameCount = 0;
    lastTime = now;
  }
  metrics.textContent = `FPS: ${fps} | Latency: ${latency}ms | Users: ${
    Object.keys(cursorEls).length + 1
  }`;
  requestAnimationFrame(measureFPS);
}
requestAnimationFrame(measureFPS);
