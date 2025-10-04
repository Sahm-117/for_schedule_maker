import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/auth';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  const adminPassword = await hashPassword('admin123!');

  const admin = await prisma.user.upsert({
    where: { email: 'admin@fofscheduler.local' },
    update: {},
    create: {
      email: 'admin@fofscheduler.local',
      name: 'FOF Admin',
      password_hash: adminPassword,
      role: 'ADMIN',
    },
  });

  console.log('✅ Created admin user:', admin.email);

  for (let weekNum = 1; weekNum <= 8; weekNum++) {
    const week = await prisma.week.upsert({
      where: { weekNumber: weekNum },
      update: {},
      create: {
        weekNumber: weekNum,
      },
    });

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (const dayName of dayNames) {
      const day = await prisma.day.upsert({
        where: {
          weekId_dayName: {
            weekId: week.id,
            dayName: dayName,
          },
        },
        update: {},
        create: {
          weekId: week.id,
          dayName: dayName,
        },
      });

      if (weekNum === 1) {
        if (dayName === 'Sunday') {
          const sundayActivities = [
            { time: '6:00 AM', description: 'Prayer Watch Post', period: 'MORNING', orderIndex: 1 },
            {
              time: '9:30 AM',
              description: 'Deacon Olakekan Ogunnii | Introductory Class [60 mins]',
              period: 'MORNING',
              orderIndex: 2
            },
            {
              time: '2:00 PM',
              description: 'Inspirational Scriptures (1) (Group Supports)',
              period: 'AFTERNOON',
              orderIndex: 1
            },
            { time: '3:00 PM', description: 'Prayer Watch Post', period: 'AFTERNOON', orderIndex: 2 },
            {
              time: '5:00 PM',
              description: 'Call Absentees (Support & Administration)',
              period: 'EVENING',
              orderIndex: 1
            },
            {
              time: '6:00 PM',
              description: 'Media Posts (photos, video, interview) from FOF, on all church platforms (Media Team)',
              period: 'EVENING',
              orderIndex: 2
            },
            {
              time: '7:00 PM',
              description: 'FOF Group Support Meeting (Administration)',
              period: 'EVENING',
              orderIndex: 3
            },
            {
              time: '9:00 PM',
              description: 'Prayer Watch Post (Group Supports)',
              period: 'EVENING',
              orderIndex: 4
            },
          ];

          for (const activity of sundayActivities) {
            await prisma.activity.create({
              data: {
                dayId: day.id,
                time: activity.time,
                description: activity.description,
                period: activity.period as 'MORNING' | 'AFTERNOON' | 'EVENING',
                orderIndex: activity.orderIndex,
              },
            });
          }
        } else {
          const dailyActivities = [
            { time: '6:00 AM', description: 'Prayer Watch Post', period: 'MORNING', orderIndex: 1 },
            {
              time: '2:00 PM',
              description: 'Inspirational Scriptures (1) (Group Supports)',
              period: 'AFTERNOON',
              orderIndex: 1
            },
            { time: '3:00 PM', description: 'Prayer Watch Post', period: 'AFTERNOON', orderIndex: 2 },
            {
              time: '9:00 PM',
              description: 'Prayer Watch Post (Group Supports)',
              period: 'EVENING',
              orderIndex: 1
            },
          ];

          for (const activity of dailyActivities) {
            await prisma.activity.create({
              data: {
                dayId: day.id,
                time: activity.time,
                description: activity.description,
                period: activity.period as 'MORNING' | 'AFTERNOON' | 'EVENING',
                orderIndex: activity.orderIndex,
              },
            });
          }
        }
      }
    }

    console.log(`✅ Created week ${weekNum} with days and activities`);
  }

  console.log('🎉 Database seed completed successfully!');
  console.log('');
  console.log('📝 Admin credentials:');
  console.log('   Email: admin@fofscheduler.local');
  console.log('   Password: admin123!');
  console.log('');
  console.log('💡 Week 1 has been populated with the initial FOF schedule.');
  console.log('   Weeks 2-8 are empty and ready for user input.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });