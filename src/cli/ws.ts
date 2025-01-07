import WebSocket from "ws";

export function initWebSocket() {
  try {
    const wss = new WebSocket.Server({ port: 4000 });

    wss.on("connection", (socket) => {
      console.log("WebSocket connection established for HMR.");

      socket.send(
        JSON.stringify({
          message: "Connected to HMR WebSocket Server",
        })
      );

      socket.on("message", (message) => {
        console.log("Message received from client:", message);
      });

      socket.on("error", (error) => {
        console.log("WebSocket error:", error);
      });

      socket.on("close", () => {
        console.log("WebSocket connection closed.");
      });
    });

    wss.on("error", (error) => {
      console.log("Error connnecting web socket server", error);
    });
  } catch (err) {
    console.log("Error connecting to websocket client", err);
  }
}
