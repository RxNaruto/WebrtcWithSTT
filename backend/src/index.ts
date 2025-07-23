import { WebSocketServer, WebSocket } from "ws";

const wss = new WebSocketServer({ port: 3004 });

let senderSocket: WebSocket | null = null;
let receiverSocket: WebSocket | null = null;

wss.on("connection", (ws) => {
    ws.on("error", console.error);

    ws.on("message", (data: any) => {
        try {
            const message = JSON.parse(data);

            if (message.type === "sender") {
                if (senderSocket) {
                    ws.send(JSON.stringify({ type: "error", message: "Sender already connected" }));
                    return;
                }
                senderSocket = ws;
                console.log("Sender joined");
            } else if (message.type === "receiver") {
                if (receiverSocket) {
                    ws.send(JSON.stringify({ type: "error", message: "Receiver already connected" }));
                    return;
                }
                receiverSocket = ws;
                console.log("Receiver joined");
            } else if (message.target === "receiver") {
                receiverSocket?.send(JSON.stringify(message));
            } else if (message.target === "sender") {
                senderSocket?.send(JSON.stringify(message));
            }
        } catch (e) {
            console.error("Invalid message format", e);
        }
    });

    ws.on("close", () => {
        if (ws === senderSocket) {
            senderSocket = null;
            console.log("Sender disconnected");
        }
        if (ws === receiverSocket) {
            receiverSocket = null;
            console.log("Receiver disconnected");
        }
    });
});
