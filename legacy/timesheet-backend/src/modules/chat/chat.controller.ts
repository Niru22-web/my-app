import { Request, Response } from 'express';
import { prisma } from '../../config/prisma';
import { getIO } from '../../services/socket.service';

export const getTeamMessages = async (req: any, res: Response) => {
  try {
    // Fetch last 50 messages to display initially
    const messages = await prisma.teamMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    
    // Sort in ascending order so they display from oldest to newest in chat
    const sortedMessages = messages.reverse();
    
    res.json({
      success: true,
      data: sortedMessages
    });
  } catch (error) {
    console.error('Error fetching team messages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch team messages'
    });
  }
};

export const createTeamMessage = async (req: any, res: Response) => {
  try {
    const { content } = req.body;
    const senderId = req.user?.id;

    if (!senderId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    if (!content || content.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Message content cannot be empty'
      });
    }

    // Fetch sender profile details (name, role, profileImage)
    const sender = await prisma.employee.findUnique({
      where: { id: senderId },
      select: {
        firstName: true,
        lastName: true,
        role: true,
        profileImage: true
      }
    });

    if (!sender) {
      return res.status(404).json({
        success: false,
        message: 'Sender not found'
      });
    }

    const senderName = `${sender.firstName} ${sender.lastName}`;
    const senderRole = sender.role;
    const senderImage = sender.profileImage || null;

    const message = await prisma.teamMessage.create({
      data: {
        senderId,
        senderName,
        senderRole,
        senderImage,
        content
      }
    });

    // Emit live socket event to all connected sockets
    const io = getIO();
    if (io) {
      io.emit('new_team_message', message);
    }

    res.json({
      success: true,
      data: message
    });
  } catch (error) {
    console.error('Error creating team message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send team message'
    });
  }
};
