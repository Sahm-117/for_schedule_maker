# FOF Schedule Manager - Backend API

Express.js + TypeScript + Prisma backend for the FOF Schedule Manager.

## Directory Structure

```
backend/
├── src/
│   ├── index.ts              # Express app entry point
│   ├── middleware/           # Authentication & authorization
│   │   └── auth.ts          # JWT authentication, role checks
│   ├── routes/              # API endpoints
│   │   ├── auth.ts          # Login, register, onboarding
│   │   ├── users.ts         # User CRUD (admin only)
│   │   ├── weeks.ts         # Week operations
│   │   ├── activities.ts    # Activity CRUD, cross-week ops
│   │   ├── pendingChanges.ts # Approval workflow
│   │   ├── rejectedChanges.ts # Rejection history
│   │   └── teams.ts         # Team color tagging
│   ├── services/            # External integrations
│   │   ├── notifications.ts # Email notifications (Resend)
│   │   └── telegram.ts      # Telegram bot notifications
│   └── utils/               # Helper functions
│       └── auth.ts          # Password hashing, JWT generation
├── prisma/
│   ├── schema.prisma        # Database schema
│   ├── seed.ts              # Initial data seeding
│   └── migrations/          # Prisma migration history
├── dist/                    # Compiled JavaScript output
├── .env                     # Environment variables (not in git)
├── .env.example             # Environment template
├── package.json
└── tsconfig.json
```

## Quick Start

### Installation
```bash
npm install
```

### Environment Setup
```bash
cp .env.example .env
# Edit .env with your configuration
```

### Database Setup
```bash
# Run migrations
npx prisma migrate deploy

# Generate Prisma Client
npx prisma generate

# Seed initial data
npm run db:seed
```

### Development
```bash
npm run dev  # Starts nodemon with hot reload
```

### Production
```bash
npm run build  # Compile TypeScript
npm start      # Run compiled code
```

## Environment Variables

Required:
```env
DATABASE_URL=postgresql://user:password@host:5432/database
JWT_SECRET=your-secure-jwt-secret-min-32-chars
JWT_REFRESH_SECRET=your-secure-refresh-secret-min-32-chars
FRONTEND_URL=https://your-frontend-url.vercel.app
PORT=3000
NODE_ENV=production
```

Optional (Notifications):
```env
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
RESEND_API_KEY=your-resend-api-key
```

## API Routes

### Authentication (`/api/auth`)
- `POST /login` - User login (rate limited: 5 attempts/15min)
- `POST /register` - Create user (admin only)
- `POST /refresh` - Refresh access token
- `GET /me` - Get current user
- `PATCH /onboarding/complete` - Complete onboarding
- `POST /onboarding/replay` - Replay onboarding tour

### Users (`/api/users`) - Admin Only
- `GET /` - List all users
- `GET /:id` - Get user by ID
- `PUT /:id` - Update user
- `DELETE /:id` - Delete user

### Weeks (`/api/weeks`)
- `GET /` - Get all weeks with days and activities
- `GET /:id` - Get specific week

### Activities (`/api/activities`)
- `POST /check-duplicates` - Check if activity exists in other weeks
- `POST /` - Create activity (admin only, supports cross-week)
- `POST /request` - Submit activity request (support users)
- `PUT /:id` - Update activity (supports cross-week)
- `DELETE /:id` - Delete activity (supports cross-week)
- `PUT /:id/reorder` - Reorder activity within time slot

### Pending Changes (`/api/pending-changes`)
- `GET /:weekId` - Get pending changes for week
- `POST /` - Create pending change (support users)
- `PUT /:id/approve` - Approve change (admin only)
- `POST /:id/reject` - Reject change with reason (admin only)

### Rejected Changes (`/api/rejected-changes`)
- `GET /me` - Get my rejected changes (support users)
- `PUT /:id/mark-read` - Mark rejection as read
- `PUT /mark-all-read` - Mark all rejections as read

### Teams (`/api/teams`)
- `GET /` - Get all teams
- `GET /:id` - Get team by ID
- `POST /` - Create team (admin only)
- `PUT /:id` - Update team (admin only)
- `DELETE /:id` - Delete team (admin only)
- `GET /activities/:id/teams` - Get teams for activity
- `POST /activities/:id/teams` - Assign teams to activity

## Security Features

✅ **Implemented:**
- Bcrypt password hashing (12 salt rounds)
- JWT authentication with refresh tokens
- Rate limiting on login endpoint (5 attempts/15min)
- Helmet security headers
- CORS configured for frontend domain
- Role-based access control (Admin/Support)
- Protected System Admin account

## Database Schema

Key models:
- `User` - Authentication & authorization
- `Week` - 8-week programme structure
- `Day` - 7 days per week (Sunday-Saturday)
- `Activity` - Schedule items with time, description, period
- `Team` - Team color tagging
- `ActivityTeam` - Many-to-many activities ↔ teams
- `PendingChange` - Support user change requests
- `RejectedChange` - Rejection history
- `AuditLog` - Critical action logging (schema ready)

## Scripts

```bash
npm run dev              # Development with hot reload
npm run build            # Compile TypeScript
npm start                # Run production build
npm run db:migrate       # Run Prisma migrations (dev)
npm run db:migrate:deploy # Run migrations (production)
npm run db:generate      # Generate Prisma Client
npm run db:seed          # Seed initial data
```

## Deployment

See `/deployment` directory for platform-specific configurations:
- Fly.io (`fly.toml`)
- Railway (`railway.toml`)
- Render (`render.yaml`)
- Docker (`Dockerfile`)

## Testing

Health check endpoint:
```bash
curl http://localhost:3000/api/health
# Expected: {"status":"OK","timestamp":"..."}
```

## Troubleshooting

### "Prisma Client not generated"
```bash
npx prisma generate
```

### "Database connection failed"
Check `DATABASE_URL` in `.env` is correct and database is accessible.

### "JWT errors"
Ensure `JWT_SECRET` and `JWT_REFRESH_SECRET` are set and at least 32 characters.

### "CORS errors"
Update `FRONTEND_URL` in `.env` to match your frontend domain.

## Development Workflow

1. Make schema changes in `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name descriptive_name`
3. Update route handlers if needed
4. Test with frontend or Postman
5. Commit migration files

## Production Checklist

- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Database seeded with admin user
- [ ] JWT secrets are strong (32+ chars)
- [ ] CORS set to production frontend URL
- [ ] HTTPS enforced
- [ ] Rate limiting active
- [ ] Health check responding

---

**Documentation:** See `/docs` in project root
**Database Migrations:** See `/database-migrations`
**Scripts:** See `/scripts`
