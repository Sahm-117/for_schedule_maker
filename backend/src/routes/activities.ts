import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, requireAdmin, AuthRequest } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

router.post('/check-duplicates', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { time, description, dayName } = req.body;

    if (!time || !description || !dayName) {
      return res.status(400).json({ error: 'Time, description, and dayName are required' });
    }

    const duplicateActivities = await prisma.activity.findMany({
      where: {
        time,
        description,
        day: {
          dayName
        }
      },
      include: {
        day: {
          include: {
            week: {
              select: { weekNumber: true }
            }
          }
        }
      }
    });

    const existingWeeks = duplicateActivities.map(activity => activity.day.week.weekNumber);

    return res.json({ existingWeeks });
  } catch (error) {
    console.error('Check duplicates error:', error);
    return res.status(500).json({ error: 'Failed to check for duplicates' });
  }
});

router.post('/', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { dayId, time, description, period, applyToWeeks = [] } = req.body;

    if (!dayId || !time || !description || !period) {
      return res.status(400).json({ error: 'dayId, time, description, and period are required' });
    }

    if (!['MORNING', 'AFTERNOON', 'EVENING'].includes(period)) {
      return res.status(400).json({ error: 'Invalid period' });
    }

    const targetDay = await prisma.day.findUnique({
      where: { id: dayId },
      include: { week: true }
    });

    if (!targetDay) {
      return res.status(400).json({ error: 'Invalid day ID' });
    }

    const activities = [];

    if (applyToWeeks.length > 0) {
      for (const weekNumber of applyToWeeks) {
        const week = await prisma.week.findUnique({
          where: { weekNumber },
          include: {
            days: {
              where: { dayName: targetDay.dayName }
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
            },
            include: {
              day: {
                include: {
                  week: {
                    select: { weekNumber: true }
                  }
                }
              }
            }
          });

          activities.push(newActivity);
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
        },
        include: {
          day: {
            include: {
              week: {
                select: { weekNumber: true }
              }
            }
          }
        }
      });

      activities.push(newActivity);
    }

    return res.status(201).json({ activities });
  } catch (error) {
    console.error('Create activity error:', error);
    return res.status(500).json({ error: 'Failed to create activity' });
  }
});

router.put('/:id', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const activityId = parseInt(req.params.id);
    const { time, description, applyToWeeks = [] } = req.body;

    if (!time || !description) {
      return res.status(400).json({ error: 'Time and description are required' });
    }

    const originalActivity = await prisma.activity.findUnique({
      where: { id: activityId },
      include: {
        day: {
          include: {
            week: true
          }
        }
      }
    });

    if (!originalActivity) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    const updatedActivities = [];

    if (applyToWeeks.length > 0) {
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
            data: { time, description },
            include: {
              day: {
                include: {
                  week: {
                    select: { weekNumber: true }
                  }
                }
              }
            }
          });

          updatedActivities.push(updated);
        }
      }
    } else {
      const updated = await prisma.activity.update({
        where: { id: activityId },
        data: { time, description },
        include: {
          day: {
            include: {
              week: {
                select: { weekNumber: true }
              }
            }
          }
        }
      });

      updatedActivities.push(updated);
    }

    return res.json({ activities: updatedActivities });
  } catch (error) {
    console.error('Update activity error:', error);
    return res.status(500).json({ error: 'Failed to update activity' });
  }
});

router.delete('/:id', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const activityId = parseInt(req.params.id);
    const { applyToWeeks = [] } = req.body;

    const originalActivity = await prisma.activity.findUnique({
      where: { id: activityId },
      include: {
        day: {
          include: {
            week: true
          }
        }
      }
    });

    if (!originalActivity) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    const deletedActivities = [];

    if (applyToWeeks.length > 0) {
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

          deletedActivities.push({
            id: duplicate.id,
            weekNumber
          });
        }
      }
    } else {
      await prisma.activity.delete({
        where: { id: activityId }
      });

      deletedActivities.push({
        id: activityId,
        weekNumber: originalActivity.day.week.weekNumber
      });
    }

    return res.json({ deletedActivities });
  } catch (error) {
    console.error('Delete activity error:', error);
    return res.status(500).json({ error: 'Failed to delete activity' });
  }
});

router.put('/:id/reorder', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const activityId = parseInt(req.params.id);
    const { newOrderIndex } = req.body;

    if (typeof newOrderIndex !== 'number') {
      return res.status(400).json({ error: 'newOrderIndex is required and must be a number' });
    }

    const activity = await prisma.activity.findUnique({
      where: { id: activityId },
      include: { day: true }
    });

    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }


    const oldIndex = activity.orderIndex;

    if (newOrderIndex > oldIndex) {
      await prisma.activity.updateMany({
        where: {
          dayId: activity.dayId,
          period: activity.period,
          orderIndex: {
            gt: oldIndex,
            lte: newOrderIndex
          }
        },
        data: {
          orderIndex: {
            decrement: 1
          }
        }
      });
    } else {
      await prisma.activity.updateMany({
        where: {
          dayId: activity.dayId,
          period: activity.period,
          orderIndex: {
            gte: newOrderIndex,
            lt: oldIndex
          }
        },
        data: {
          orderIndex: {
            increment: 1
          }
        }
      });
    }

    const updatedActivity = await prisma.activity.update({
      where: { id: activityId },
      data: { orderIndex: newOrderIndex },
      include: {
        day: {
          include: {
            week: {
              select: { weekNumber: true }
            }
          }
        }
      }
    });

    return res.json({ activity: updatedActivity });
  } catch (error) {
    console.error('Reorder activity error:', error);
    return res.status(500).json({ error: 'Failed to reorder activity' });
  }
});

export default router;