import type { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { env } from "../config/env";
import { verifyAccessToken, type JwtUser } from "./auth";

let io: SocketIOServer | null = null;

/**
 * Socket.IO for live notifications and the team chat.
 * Every connection must carry a valid, current login (same check as the API). Each person is put in
 * their own room by the server — clients can't choose which notifications they receive.
 */
export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.FRONTEND_ORIGINS,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    const raw =
      (socket.handshake.auth?.token as string | undefined) ||
      (socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, "") as string | undefined);
    if (!raw) return next(new Error("Sign-in required"));
    const result = await verifyAccessToken(raw);
    if ("error" in result) return next(new Error(result.error.message));
    socket.data.user = result.user;
    next();
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as JwtUser;
    socket.join(user.id);
    // Older clients still ask to join "their" room — always their own, whatever id they send.
    socket.on("join_user_room", () => socket.join(user.id));
  });

  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}
