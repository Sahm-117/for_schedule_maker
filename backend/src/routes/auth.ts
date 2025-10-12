import express from 'express';
import { PrismaClient } from '@prisma/client';
import rateLimit from 'express-rate-limit';
import { hashPassword, comparePassword, generateTokens, verifyRefreshToken } from '../utils/auth';
import { authenticateToken, requireAdmin, AuthRequest } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Rate limiting: 5 login attempts per 15 minutes per IP
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many login attempts from this IP, please try again after 15 minutes'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Skip successful logins (only count failed attempts)
  skipSuccessfulRequests: true,
});

router.post('/register', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { email, name, password, role = 'SUPPORT' } = req.body;

    if (!email || !name || !password) {
      return res.status(400).json({ error: 'Email, name, and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const password_hash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        name,
        password_hash,
        role: role as 'ADMIN' | 'SUPPORT'
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true
      }
    });

    return res.status(201).json({ user });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Failed to create user' });
  }
});

router.post('/login', loginRateLimiter, async (req, res): Promise<any> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await comparePassword(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const { accessToken, refreshToken } = generateTokens(user.id);

    const userResponse = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    };

    return res.json({
      user: userResponse,
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/refresh', async (req, res): Promise<any> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const decoded = verifyRefreshToken(refreshToken);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true, role: true }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user.id);

    return res.json({
      user,
      accessToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

router.get('/me', authenticateToken, async (req: AuthRequest, res): Promise<any> => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not found' });
    }

    return res.json({ user: req.user });
  } catch (error) {
    console.error('Get user error:', error);
    return res.status(500).json({ error: 'Failed to get user info' });
  }
});

router.patch('/onboarding/complete', authenticateToken, async (req: AuthRequest, res): Promise<any> => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: { onboardingCompleted: true },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        onboardingCompleted: true
      }
    });

    return res.json({ user: updatedUser });
  } catch (error) {
    console.error('Complete onboarding error:', error);
    return res.status(500).json({ error: 'Failed to complete onboarding' });
  }
});

export default router;