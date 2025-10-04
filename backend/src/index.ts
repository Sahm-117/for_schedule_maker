import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { PrismaClient } from '@prisma/client';

import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import weekRoutes from './routes/weeks';
import activityRoutes from './routes/activities';
import pendingChangeRoutes from './routes/pendingChanges';
import rejectedChangeRoutes from './routes/rejectedChanges';

const app = express();
const port = process.env.PORT || 3000;
const prisma = new PrismaClient();

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/weeks', weekRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/pending-changes', pendingChangeRoutes);
app.use('/api/rejected-changes', rejectedChangeRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

const server = app.listen(port, () => {
  console.log(`🚀 FOF Schedule Editor API running on port ${port}`);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await prisma.$disconnect();
  server.close(() => {
    process.exit(0);
  });
});

export { prisma };