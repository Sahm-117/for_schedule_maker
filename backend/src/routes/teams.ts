import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, requireAdmin, AuthRequest } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/teams - Get all teams (accessible by all authenticated users)
router.get('/', authenticateToken, async (req: AuthRequest, res): Promise<any> => {
  try {
    const teams = await prisma.team.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        _count: {
          select: { activities: true }
        }
      }
    });

    return res.json(teams);
  } catch (error) {
    console.error('Error fetching teams:', error);
    return res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

// POST /api/teams - Create a new team (admin only)
router.post('/', authenticateToken, requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const { name, color } = req.body;

    if (!name || !color) {
      return res.status(400).json({ error: 'Team name and color are required' });
    }

    // Validate color format (hex code)
    if (!/^#[0-9A-F]{6}$/i.test(color)) {
      return res.status(400).json({ error: 'Color must be a valid hex code (e.g., #FF5733)' });
    }

    // Check if team with this name already exists
    const existingTeam = await prisma.team.findUnique({
      where: { name }
    });

    if (existingTeam) {
      return res.status(400).json({ error: 'A team with this name already exists' });
    }

    const team = await prisma.team.create({
      data: { name, color },
      include: {
        _count: {
          select: { activities: true }
        }
      }
    });

    return res.status(201).json(team);
  } catch (error) {
    console.error('Error creating team:', error);
    return res.status(500).json({ error: 'Failed to create team' });
  }
});

// PATCH /api/teams/:id - Update a team (admin only)
router.patch('/:id', authenticateToken, requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const { id } = req.params;
    const { name, color } = req.body;

    if (!name && !color) {
      return res.status(400).json({ error: 'At least one field (name or color) is required' });
    }

    // Validate color format if provided
    if (color && !/^#[0-9A-F]{6}$/i.test(color)) {
      return res.status(400).json({ error: 'Color must be a valid hex code (e.g., #FF5733)' });
    }

    const updateData: any = {};
    if (name) {
      // Check if another team with this name exists
      const existingTeam = await prisma.team.findFirst({
        where: {
          name,
          id: { not: parseInt(id) }
        }
      });

      if (existingTeam) {
        return res.status(400).json({ error: 'A team with this name already exists' });
      }

      updateData.name = name;
    }
    if (color) updateData.color = color;

    const team = await prisma.team.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        _count: {
          select: { activities: true }
        }
      }
    });

    return res.json(team);
  } catch (error: any) {
    console.error('Error updating team:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Team not found' });
    }
    return res.status(500).json({ error: 'Failed to update team' });
  }
});

// DELETE /api/teams/:id - Delete a team (admin only)
// Note: Cascade delete will automatically remove ActivityTeam entries
router.delete('/:id', authenticateToken, requireAdmin, async (req: AuthRequest, res): Promise<any> => {
  try {
    const { id } = req.params;

    const team = await prisma.team.delete({
      where: { id: parseInt(id) }
    });

    return res.json({ message: 'Team deleted successfully', team });
  } catch (error: any) {
    console.error('Error deleting team:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Team not found' });
    }
    return res.status(500).json({ error: 'Failed to delete team' });
  }
});

export default router;
