#!/usr/bin/env node
const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");
const ROOT = __dirname;
const PORT = process.env.PORT || 8787;
const rooms = new Map();
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".png": "image/png"
};
const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split("?")[0]);
  if (url === "/") url = "/index.html";
  const file = path.normalize(path.join(ROOT, url));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
});
const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (ws) => {
  ws.meta = { code: null };
  ws.on("message", (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (msg.op === "join") {
      const code = String(msg.code || "").toUpperCase();
      ws.meta.code = code;
      if (!rooms.has(code)) rooms.set(code, { room: msg.room, clients: new Set() });
      const r = rooms.get(code);
      r.clients.add(ws);
      if (msg.room) r.room = msg.room;
      if (r.room && msg.clientId && !(r.room.members || []).some((m) => m.id === msg.clientId)) {
        r.room.members = r.room.members || [];
        r.room.members.push({ id: msg.clientId, name: msg.name || "OP" });
      }
      ws.send(JSON.stringify({ op: "state", room: r.room }));
      for (const c of r.clients) if (c.readyState === 1) c.send(JSON.stringify({ op: "presence", members: (r.room && r.room.members) || [] }));
    }
    if (msg.op === "state" && ws.meta.code) {
      const r = rooms.get(ws.meta.code);
      if (!r) return;
      r.room = msg.room;
      for (const c of r.clients) if (c !== ws && c.readyState === 1) c.send(JSON.stringify({ op: "state", room: r.room }));
    }
  });
  ws.on("close", () => {
    if (!ws.meta.code) return;
    const r = rooms.get(ws.meta.code);
    if (!r) return;
    r.clients.delete(ws);
  });
});
server.listen(PORT, () => console.log("WARDEN  http://localhost:" + PORT));
