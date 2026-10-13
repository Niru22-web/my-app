import type { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { JwtUser } from "./auth";

let io: SocketIOServer | null = null;

/**
 * Authenticated Socket.IO server (fixes S5: verifies JWT when present and restricts room joins).
 */
export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.FRONTEND_URL || "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const rawToken =
      (socket.handshake.auth?.token as string | undefined) ||
      (socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, "") as string | undefined);
    if (rawToken) {
      try {
        socket.data.user = jwt.verify(rawToken, env.JWT_SECRET) as JwtUser;
      } catch {
        return next(new Error("Invalid socket authentication token"));
      }
    }
    next();
  });

  io.on("connection", (socket) => {
    socket.on("join_user_room", (userId: unknown) => {
      if (typeof userId !== "string" || !userId.trim()) return;
      const authedUser = socket.data.user as JwtUser | undefined;
      // If socket has a verified JWT, only allow joining the user's own room (S5)
      if (authedUser && authedUser.id !== userId) return;
      socket.join(userId);
    });
  });

  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}
