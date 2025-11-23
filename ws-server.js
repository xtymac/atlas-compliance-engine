// Minimal WebSocket broadcast server for Content sync
// Usage: node ws-server.js
const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.WS_PORT || 7070;
const server = http.createServer();
const wss = new WebSocket.Server({ server });

// In-memory content store by modelId
const store = {};

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
      // send snapshot
      ws.send(
        JSON.stringify({
          type: "snapshot",
          modelId: data.modelId,
          items: store[data.modelId] || [],
        })
      );
      return;
    }
    if (data.type === "patch" && ws.modelId) {
      const { modelId, items } = data;
      store[modelId] = items;
      // broadcast
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(
            JSON.stringify({
              type: "patch",
              modelId,
              items,
            })
          );
        }
      });
    }
  });
});

server.listen(PORT, () => {
  console.log(`WS server running on ws://localhost:${PORT}`);
});
