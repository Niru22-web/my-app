import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getEvents = async (req: Request, res: Response) => {
  try {
    const events = await prisma.event.findMany({
      orderBy: { date: 'asc' },
      include: {
        createdBy: {
          select: { firstName: true, lastName: true }
        }
      }
    });
    res.json({ success: true, data: events });
  } catch (error) {
    console.error('Get Events Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const createEvent = async (req: Request, res: Response) => {
  try {
    const { title, date, time, type } = req.body;
    const userId = (req as any).user.id;
    const role = (req as any).user.role;

    if (!['Admin', 'HR', 'Partner', 'manager', 'owner'].some(r => role.toLowerCase().includes(r.toLowerCase()))) {
      return res.status(403).json({ success: false, message: 'Unauthorized to create events' });
    }

    const event = await prisma.event.create({
      data: {
        title,
        date: new Date(date),
        time,
        type: type || 'Other',
        createdById: userId
      }
    });

    res.json({ success: true, data: event });
  } catch (error) {
    console.error('Create Event Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const deleteEvent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const role = (req as any).user.role;

    if (!['Admin', 'HR', 'Partner', 'manager', 'owner'].some(r => role.toLowerCase().includes(r.toLowerCase()))) {
      return res.status(403).json({ success: false, message: 'Unauthorized to delete events' });
    }

    await prisma.event.delete({ where: { id } });
    res.json({ success: true, message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Delete Event Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
