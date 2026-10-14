import { prisma } from "../config/db";
import { getIO } from "../plugins/socket";

export interface NotifyInput {
  userId: string;
  title: string;
  message: string;
  type: string;
  module?: string;
  priority?: string;
  relatedId?: string;
  actionUrl?: string;
}

export async function createNotification(input: NotifyInput) {
  try {
    // Only allow internal paths for actionUrl (fixes E5)
    const safeUrl =
      input.actionUrl && input.actionUrl.startsWith("/") && !input.actionUrl.startsWith("//")
        ? input.actionUrl
        : null;

    const notif = await prisma.notification.create({
      data: {
        userId: input.userId,
        title: input.title,
        message: input.message,
        type: input.type,
        module: input.module ?? "Employee",
        priority: input.priority ?? "Info",
        relatedId: input.relatedId ?? null,
        actionUrl: safeUrl,
      },
    });

    const io = getIO();
    if (io) {
      io.to(input.userId).emit("new_notification", notif);
    }
    return notif;
  } catch {
    return null;
  }
}
