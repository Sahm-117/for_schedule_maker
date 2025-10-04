import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, requireAdmin, AuthRequest } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/:weekId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const weekId = parseInt(req.params.weekId);

    const pendingChanges = await prisma.pendingChange.findMany({
      where: { weekId },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({ pendingChanges });
  } catch (error) {
    console.error('Get pending changes error:', error);
    return res.status(500).json({ error: 'Failed to fetch pending changes' });
  }
});

router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { weekId, changeType, changeData } = req.body;

    if (!weekId || !changeType || !changeData) {
      return res.status(400).json({ error: 'weekId, changeType, and changeData are required' });
    }

    if (!['ADD', 'EDIT', 'DELETE'].includes(changeType)) {
      return res.status(400).json({ error: 'Invalid changeType' });
    }

    if (!req.user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (req.user.role === 'ADMIN') {
      return res.status(400).json({ error: 'Admins should make changes directly, not submit for approval' });
    }

    const pendingChange = await prisma.pendingChange.create({
      data: {
        weekId,
        changeType,
        changeData,
        userId: req.user.id
      },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    return res.status(201).json({ pendingChange });
  } catch (error) {
    console.error('Create pending change error:', error);
    return res.status(500).json({ error: 'Failed to create pending change' });
  }
});

router.put('/:id/approve', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const changeId = req.params.id;

    const pendingChange = await prisma.pendingChange.findUnique({
      where: { id: changeId },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!pendingChange) {
      return res.status(404).json({ error: 'Pending change not found' });
    }

    const { changeType, changeData } = pendingChange;
    const results = [];

    try {
      if (changeType === 'ADD') {
        const { dayId, time, description, period, applyToWeeks = [] } = changeData as any;

        if (applyToWeeks.length > 0) {
          for (const weekNumber of applyToWeeks) {
            const week = await prisma.week.findUnique({
              where: { weekNumber },
              include: {
                days: {
                  where: {
                    dayName: (changeData as any).dayName
                  }
                }
              }
            });

            if (week && week.days.length > 0) {
              const day = week.days[0];
              const existingActivitiesCount = await prisma.activity.count({
                where: { dayId: day.id, period }
              });

              const newActivity = await prisma.activity.create({
                data: {
                  dayId: day.id,
                  time,
                  description,
                  period,
                  orderIndex: existingActivitiesCount + 1
                }
              });

              results.push({ weekNumber, activity: newActivity });
            }
          }
        } else {
          const existingActivitiesCount = await prisma.activity.count({
            where: { dayId, period }
          });

          const newActivity = await prisma.activity.create({
            data: {
              dayId,
              time,
              description,
              period,
              orderIndex: existingActivitiesCount + 1
            }
          });

          results.push({ activity: newActivity });
        }
      } else if (changeType === 'EDIT') {
        const { activityId, time, description, applyToWeeks = [] } = changeData as any;

        if (applyToWeeks.length > 0) {
          const originalActivity = await prisma.activity.findUnique({
            where: { id: activityId },
            include: {
              day: true
            }
          });

          if (originalActivity) {
            for (const weekNumber of applyToWeeks) {
              const duplicateActivities = await prisma.activity.findMany({
                where: {
                  time: originalActivity.time,
                  description: originalActivity.description,
                  day: {
                    dayName: originalActivity.day.dayName,
                    week: {
                      weekNumber
                    }
                  }
                }
              });

              for (const duplicate of duplicateActivities) {
                const updated = await prisma.activity.update({
                  where: { id: duplicate.id },
                  data: { time, description }
                });

                results.push({ weekNumber, activity: updated });
              }
            }
          }
        } else {
          const updated = await prisma.activity.update({
            where: { id: activityId },
            data: { time, description }
          });

          results.push({ activity: updated });
        }
      } else if (changeType === 'DELETE') {
        const { activityId, applyToWeeks = [] } = changeData as any;

        if (applyToWeeks.length > 0) {
          const originalActivity = await prisma.activity.findUnique({
            where: { id: activityId },
            include: {
              day: true
            }
          });

          if (originalActivity) {
            for (const weekNumber of applyToWeeks) {
              const duplicateActivities = await prisma.activity.findMany({
                where: {
                  time: originalActivity.time,
                  description: originalActivity.description,
                  day: {
                    dayName: originalActivity.day.dayName,
                    week: {
                      weekNumber
                    }
                  }
                }
              });

              for (const duplicate of duplicateActivities) {
                await prisma.activity.delete({
                  where: { id: duplicate.id }
                });

                results.push({ weekNumber, deletedId: duplicate.id });
              }
            }
          }
        } else {
          await prisma.activity.delete({
            where: { id: activityId }
          });

          results.push({ deletedId: activityId });
        }
      }

      await prisma.pendingChange.delete({
        where: { id: changeId }
      });

      return res.json({
        message: 'Change approved and applied successfully',
        results,
        approvedBy: req.user?.id
      });

    } catch (applicationError) {
      console.error('Error applying approved change:', applicationError);
      return res.status(500).json({
        error: 'Failed to apply approved change',
        details: applicationError instanceof Error ? applicationError.message : 'Unknown error'
      });
    }

  } catch (error) {
    console.error('Approve change error:', error);
    return res.status(500).json({ error: 'Failed to approve change' });
  }
});

router.post('/:id/reject', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const changeId = req.params.id;
    const { rejectionReason } = req.body;

    if (!rejectionReason || rejectionReason.trim().length === 0) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const pendingChange = await prisma.pendingChange.findUnique({
      where: { id: changeId }
    });

    if (!pendingChange) {
      return res.status(404).json({ error: 'Pending change not found' });
    }

    if (!req.user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const rejectedChange = await prisma.rejectedChange.create({
      data: {
        weekId: pendingChange.weekId,
        changeType: pendingChange.changeType,
        changeData: pendingChange.changeData as any,
        userId: pendingChange.userId,
        submittedAt: pendingChange.createdAt,
        rejectedBy: req.user.id,
        rejectionReason: rejectionReason.trim(),
        isRead: false
      }
    });

    await prisma.pendingChange.delete({
      where: { id: changeId }
    });

    return res.json({
      message: 'Change rejected successfully',
      rejectedChange: {
        id: rejectedChange.id,
        rejectionReason: rejectedChange.rejectionReason,
        rejectedBy: req.user.id,
        rejectedAt: rejectedChange.rejectedAt
      }
    });

  } catch (error) {
    console.error('Reject change error:', error);
    return res.status(500).json({ error: 'Failed to reject change' });
  }
});

export default router;