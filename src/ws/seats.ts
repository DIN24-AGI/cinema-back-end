import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";

interface Client {
	ws: WebSocket;
	showtime_uid: string | null;
}

export interface SeatsHub {
	broadcastSeatUpdate: (showtime_uid: string, seat_uid: string, status: string) => void;
}

// Singleton instance
let hub: SeatsHub | null = null;

/**
 * Initialize WebSocket server for seats.
 * Must be called once from index.ts after HTTP server is created.
 */
export function initSeatsWSS(server: Server): SeatsHub {
	if (hub) return hub; // already initialized

	const wss = new WebSocketServer({ noServer: true });
	const clients: Client[] = [];

	// Accept only /ws/seats
	server.on("upgrade", (req, socket, head) => {
		if (req.url?.startsWith("/ws/seats")) {
			wss.handleUpgrade(req, socket, head, (ws) => {
				wss.emit("connection", ws, req);
			});
		} else {
			socket.destroy();
		}
	});

	wss.on("connection", (ws, req) => {
		console.log("Client connected to Seats WebSocket");

		const params = new URLSearchParams(req.url?.split("?")[1]);
		const showtime_uid = params.get("showtime_uid");

		const client: Client = { ws, showtime_uid };
		clients.push(client);

		ws.on("close", () => {
			const idx = clients.indexOf(client);
			if (idx !== -1) clients.splice(idx, 1);
			console.log("Client disconnected from Seats WS");
		});
	});

	function broadcastSeatUpdate(showtime_uid: string, seat_uid: string, status: string) {
		const payload = JSON.stringify({
			type: "seat_update",
			showtime_uid,
			seat_uid,
			status,
		});

		for (const c of clients) {
			if (c.showtime_uid === showtime_uid) {
				c.ws.send(payload);
			}
		}
	}

	hub = { broadcastSeatUpdate };
	return hub;
}

/**
 * Get current Seats WebSocket hub.
 * Can be used from routes (payments, webhook) to broadcast updates.
 */
export function getSeatsHub(): SeatsHub | null {
	return hub;
}
