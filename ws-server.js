// Minimal WebSocket broadcast server for Content sync
// Usage: node ws-server.js
const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.WS_PORT || 7070;
const server = http.createServer();
const wss = new WebSocket.Server({ server });

// In-memory content store by modelId
const store = {};
const presence = {};

wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch (e) {
      return;
    }
    if (data.type === "join") {
      ws.modelId = data.modelId;
      ws.user = data.user || "anon";
      if (!presence[ws.modelId]) presence[ws.modelId] = new Set();
      presence[ws.modelId].add(ws.user);
      // notify presence
      broadcastPresence(ws.modelId);
      // send snapshot
      ws.send(
        JSON.stringify({
          type: "snapshot",
          modelId: data.modelId,
          items: store[data.modelId] || [],
          presence: Array.from(presence[ws.modelId] || []),
        })
      );
      return;
    }
    if (data.type === "patch") {
      const { modelId, edits = [] } = data;
      if (!store[modelId]) store[modelId] = [];
      edits.forEach((edit) => {
        const row = store[modelId][edit.rowId] || {};
        row[edit.key] = edit.newValue;
        store[modelId][edit.rowId] = row;
      });
      broadcast({
        type: "patch",
        modelId,
        edits,
        user: data.user || ws.user || "anon",
      });
    }
  });

  ws.on("close", () => {
    if (ws.modelId && ws.user && presence[ws.modelId]) {
      presence[ws.modelId].delete(ws.user);
      broadcastPresence(ws.modelId);
    }
  });
});

function broadcastPresence(modelId) {
  broadcast({
    type: "presence",
    modelId,
    users: Array.from(presence[modelId] || []),
  });
}

function broadcast(payload) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(payload));
    }
  });
}

server.listen(PORT, () => {
  console.log(`WS server running on ws://localhost:${PORT}`);
});
