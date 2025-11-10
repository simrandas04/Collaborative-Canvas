# 🖌️ Collaborative Canvas (Real-Time Multi-User Drawing App)

A lightweight real-time collaborative drawing board built using **Vanilla JS + Node.js + Socket.io**.

Multiple users can draw on the same canvas simultaneously, with live synchronization, global undo/redo, and persistence.

---

## 🚀 Features

- ✍️ Real-time brush drawing with color & width control  
- 🧽 Eraser tool (non-destructive pixel removal)  
- 🔁 Global undo/redo across all users  
- 👥 Live cursors showing other users’ positions  
- 💾 Save & load canvas state from server  
- 📊 FPS + latency monitor  
- 📱 Works on both desktop and mobile touch devices  

---

## ⚙️ Tech Stack

| Component | Technology |
|------------|-------------|
| Frontend | Vanilla JavaScript, HTML5 Canvas |
| Backend | Node.js, Express, Socket.io |
| Sync | WebSockets (bidirectional, real-time) |
| Persistence | Local JSON file on server |
