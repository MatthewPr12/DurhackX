#!/usr/bin/env node
// Simple WebSocket relay server for multiplayer demo
// Usage: node server/ws-server.js [port]

const WebSocket = require("ws");
const port = Number(process.argv[2] || process.env.PORT || 8080);

const wss = new WebSocket.Server({ port });
console.log(`[ws-server] listening on ws://0.0.0.0:${port}`);

// Broadcast message to all other clients
function broadcast(sender, data) {
  const s = typeof data === "string" ? data : JSON.stringify(data);
  for (const c of wss.clients) {
    if (c !== sender && c.readyState === WebSocket.OPEN) {
      c.send(s);
    }
  }
}

wss.on("connection", (ws, req) => {
  console.log("[ws-server] client connected", req.socket.remoteAddress);

  ws.on("message", (raw) => {
    // simply relay to other clients (no validation for demo)
    try {
      broadcast(ws, raw.toString());
    } catch (e) {
      console.error("[ws-server] broadcast failed", e);
    }
  });

  ws.on("close", () => {
    console.log("[ws-server] client disconnected");
  });
});

process.on("SIGINT", () => {
  console.log("[ws-server] shutting down");
  wss.close(() => process.exit(0));
});
