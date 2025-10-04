import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', authenticateToken, async (_req: AuthRequest, res) => {
  try {
    const weeks = await prisma.week.findMany({
      include: {
        days: {
          include: {
            activities: {
              orderBy: { orderIndex: 'asc' }
            }
          }
        }
      },
      orderBy: { weekNumber: 'asc' }
    });

    return res.json({ weeks });
  } catch (error) {
    console.error('Get weeks error:', error);
    return res.status(500).json({ error: 'Failed to fetch weeks' });
  }
});

router.get('/:weekId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const weekId = parseInt(req.params.weekId);

    const week = await prisma.week.findUnique({
      where: { id: weekId },
      include: {
        days: {
          include: {
            activities: {
              orderBy: { orderIndex: 'asc' }
            }
          },
          orderBy: { dayName: 'asc' }
        }
      }
    });

    if (!week) {
      return res.status(404).json({ error: 'Week not found' });
    }

    const pendingChanges = await prisma.pendingChange.findMany({
      where: { weekId },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({ week, pendingChanges });
  } catch (error) {
    console.error('Get week error:', error);
    return res.status(500).json({ error: 'Failed to fetch week' });
  }
});

export default router;