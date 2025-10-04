import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/me', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const rejectedChanges = await prisma.rejectedChange.findMany({
      where: { userId: req.user.id },
      orderBy: { rejectedAt: 'desc' }
    });

    const unreadCount = await prisma.rejectedChange.count({
      where: {
        userId: req.user.id,
        isRead: false
      }
    });

    return res.json({
      rejectedChanges,
      unreadCount
    });
  } catch (error) {
    console.error('Get rejected changes error:', error);
    return res.status(500).json({ error: 'Failed to fetch rejected changes' });
  }
});

router.put('/:id/mark-read', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const rejectedChangeId = req.params.id;

    if (!req.user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const rejectedChange = await prisma.rejectedChange.findUnique({
      where: { id: rejectedChangeId }
    });

    if (!rejectedChange) {
      return res.status(404).json({ error: 'Rejected change not found' });
    }

    if (rejectedChange.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updatedRejectedChange = await prisma.rejectedChange.update({
      where: { id: rejectedChangeId },
      data: { isRead: true }
    });

    return res.json({
      message: 'Rejection marked as read',
      rejectedChange: updatedRejectedChange
    });
  } catch (error) {
    console.error('Mark read error:', error);
    return res.status(500).json({ error: 'Failed to mark rejection as read' });
  }
});

router.put('/mark-all-read', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const result = await prisma.rejectedChange.updateMany({
      where: {
        userId: req.user.id,
        isRead: false
      },
      data: { isRead: true }
    });

    return res.json({
      message: 'All rejections marked as read',
      updatedCount: result.count
    });
  } catch (error) {
    console.error('Mark all read error:', error);
    return res.status(500).json({ error: 'Failed to mark all rejections as read' });
  }
});

export default router;