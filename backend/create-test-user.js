#!/usr/bin/env node

// Simple script to create a test user directly via Prisma
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function createTestUser() {
  try {
    console.log('🔧 Creating test admin user...');

    // Hash the password
    const passwordHash = await bcrypt.hash('admin123', 10);

    // Create or update admin user
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin@test.com' },
      update: {
        password_hash: passwordHash,
        name: 'Test Admin',
        role: 'ADMIN'
      },
      create: {
        id: 'test-admin-user-id',
        email: 'admin@test.com',
        password_hash: passwordHash,
        name: 'Test Admin',
        role: 'ADMIN'
      }
    });

    console.log('✅ Admin user created:', adminUser.email);

    // Create or update support user
    const supportPasswordHash = await bcrypt.hash('support123', 10);
    const supportUser = await prisma.user.upsert({
      where: { email: 'support@test.com' },
      update: {
        password_hash: supportPasswordHash,
        name: 'Test Support',
        role: 'SUPPORT'
      },
      create: {
        id: 'test-support-user-id',
        email: 'support@test.com',
        password_hash: supportPasswordHash,
        name: 'Test Support',
        role: 'SUPPORT'
      }
    });

    console.log('✅ Support user created:', supportUser.email);
    console.log('✅ Test users ready for login');

  } catch (error) {
    console.error('❌ Error creating test users:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestUser();