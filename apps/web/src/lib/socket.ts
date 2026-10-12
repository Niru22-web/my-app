"use client";

import { io, type Socket } from "socket.io-client";

// One Socket.IO connection per tab, shared by notifications, chat and any future live feature.
// Reference-counted so it closes when the last user unmounts (e.g. on sign-out).

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || undefined;

let socket: Socket | null = null;
let refs = 0;
let closeTimer: ReturnType<typeof setTimeout> | null = null;

export function acquireSocket(): Socket {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  if (!socket) {
    socket = io(SOCKET_URL, { transports: ["websocket", "polling"], reconnectionAttempts: 10, reconnectionDelay: 2000 });
  }
  refs++;
  return socket;
}

export function releaseSocket() {
  refs = Math.max(0, refs - 1);
  if (refs === 0 && socket) {
    // Short grace period so a quick remount (navigation, dev double-render) reuses the connection.
    closeTimer = setTimeout(() => {
      socket?.disconnect();
      socket = null;
      closeTimer = null;
    }, 1500);
  }
}
