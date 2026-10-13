import { Server as SocketIOServer } from 'socket.io';
import { Server } from 'http';
import jwt from 'jsonwebtoken';

let io: SocketIOServer;

export const initSocket = (server: Server) => {
  io = new SocketIOServer(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log('🔗 Client connected to notification channel:', socket.id);

    // Join personal room
    socket.on('join_user_room', (userId: string) => {
      if (typeof userId !== 'string' || !userId.trim()) {
        return;
      }
      const trimmedUserId = userId.trim();

      const authHeader = socket.handshake.headers?.authorization;
      const rawToken =
        socket.handshake.auth?.token ||
        (typeof socket.handshake.query?.token === 'string' ? socket.handshake.query.token : undefined) ||
        (typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined);

      if (rawToken && typeof rawToken === 'string') {
        try {
          const decoded: any = jwt.verify(
            rawToken.replace(/^Bearer\s+/i, ''),
            process.env.JWT_SECRET || 'supersecretkey'
          );
          const tokenUserId = decoded?.id;
          const tokenEmployeeId = decoded?.employeeId;
          if (tokenUserId && tokenUserId !== trimmedUserId && tokenEmployeeId !== trimmedUserId) {
            console.warn(`🚫 Socket ${socket.id} blocked from joining room ${trimmedUserId} (token user: ${tokenUserId})`);
            return;
          }
        } catch (err: any) {
          console.warn(`🚫 Socket ${socket.id} failed token verification on join_user_room:`, err?.message);
          return;
        }
      }

      socket.join(trimmedUserId);
      console.log(`👤 Authorized User ${trimmedUserId} joined personal socket room.`);
    });

    socket.on('disconnect', () => {
      console.log('🔴 Client disconnected from notification channel:', socket.id);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    console.warn('Socket.io has not been initialized yet.');
  }
  return io;
};
