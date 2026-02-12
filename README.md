# FOF Schedule Editor - Full Production Build

Foundation of Faith (FOF) is an 8-week church discipleship programme. This application allows support team members to collaboratively edit weekly schedules, with admin approval for changes.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL database (or use Prisma local dev database)

### Development Setup

1. **Clone and navigate to the project**
   ```bash
   cd FOF_SOP_Scheduler
   ```

2. **Backend Setup**
   ```bash
   cd backend
   npm install

   # Copy environment variables
   cp .env.example .env
   # Edit .env with your database credentials

   # Start local Prisma database (or use your own PostgreSQL)
   npx prisma dev  # This runs in background

   # Run migrations and seed data
   npm run db:migrate
   npm run db:seed

   # Start backend development server
   npm run dev
   ```

3. **Frontend Setup** (in new terminal)
   ```bash
   cd frontend
   npm install

   # Copy environment variables
   cp .env.example .env

   # Start frontend development server
   npm run dev
   ```

### Default Admin Account
After seeding, use these credentials to log in:
- **Email:** admin@fofscheduler.local
- **Password:** admin123!

## 📋 Features Completed

### ✅ Backend Infrastructure
- **Authentication System**
  - JWT-based authentication with refresh tokens
  - Role-based access control (Admin/Support)
  - Password hashing with bcrypt
  - Admin-only user registration

- **Database Schema**
  - Complete Prisma schema with all required models
  - User management with roles
  - Week/Day/Activity structure
  - Pending changes workflow
  - Rejection history tracking

- **API Endpoints** (Basic structure)
  - Authentication routes (`/api/auth/*`)
  - User management (`/api/users/*`)
  - Schedule management (`/api/weeks/*`, `/api/activities/*`)
  - Pending changes (`/api/pending-changes/*`)
  - Rejection history (`/api/rejected-changes/*`)

- **Initial Data**
  - Week 1 populated with FOF schedule from SOP document
  - Weeks 2-8 created but empty
  - Admin user created for testing

### 🚧 What's Next

The foundation is complete! The next phase will implement:

1. **Full API Implementation**
   - Complete CRUD operations for all entities
   - Cross-week activity management
   - Pending changes approval workflow
   - PDF export functionality

2. **Frontend Development**
   - React 18 + TypeScript setup
   - Authentication UI
   - Schedule view and editing
   - Cross-week selection interface
   - Admin approval dashboard

3. **Advanced Features**
   - Visual pending change indicators
   - Rejection system with reasons
   - Change history tracking
   - Responsive design

## 🗂 Project Structure

```
FOF_SOP_Scheduler/
├── backend/
│   ├── src/
│   │   ├── routes/         # API endpoints
│   │   ├── middleware/     # Auth middleware
│   │   ├── utils/          # Helper functions
│   │   └── index.ts        # Express server
│   ├── prisma/
│   │   ├── schema.prisma   # Database schema
│   │   └── seed.ts         # Initial data
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/          # Page components
│   │   ├── services/       # API client
│   │   ├── hooks/          # Custom hooks
│   │   ├── types/          # TypeScript types
│   │   └── utils/          # Helper functions
│   └── package.json
└── README.md
```

## 🧪 API Testing

Test the backend with curl:

```bash
# Health check
curl http://localhost:3000/api/health

# Login (get access token)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@fofscheduler.local",
    "password": "admin123!"
  }'

# Use the token for authenticated requests
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/weeks
```

## 🔑 Environment Variables

### Backend (.env)
```env
DATABASE_URL="your-postgresql-connection-string"
JWT_SECRET="your-jwt-secret-minimum-32-characters"
JWT_REFRESH_SECRET="your-refresh-secret-minimum-32-characters"
FRONTEND_URL="http://localhost:5173"
PORT=3000
```

### Frontend (.env)
```env
VITE_DATA_PROVIDER=supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Optional backend mode (future)
# VITE_DATA_PROVIDER=backend
# VITE_API_URL=https://your-backend-url.com/api
```

### Production Recommendation
- Use `VITE_DATA_PROVIDER=supabase` for the current production architecture.
- Keep backend mode as an optional future path.

### Telegram Notifications (Supabase Edge Function)
Set Supabase function secrets (not Vercel frontend env vars):
```bash
supabase secrets set TELEGRAM_BOT_TOKEN=123456:your-bot-token
supabase secrets set TELEGRAM_CHAT_ID=-1001234567890
```

Deploy function:
```bash
supabase functions deploy notify-telegram
```

The edge function sends Telegram notifications when:
- support submits a change request
- admin approves a request
- admin rejects a request

After function validation, remove `VITE_TELEGRAM_BOT_TOKEN` and `VITE_TELEGRAM_GROUP_CHAT_ID` from Vercel frontend envs.

Validation example:
```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/sendMessage" \
  -H "Content-Type: application/json" \
  -d '{"chat_id":"<YOUR_CHAT_ID>","text":"FOF Scheduler Telegram test"}'
```

## 📊 Database Schema

Key models:
- **User** - Authentication and role management
- **Week** - 8 weeks of the programme
- **Day** - 7 days per week
- **Activity** - Individual schedule items with time/description/period
- **PendingChange** - Changes awaiting admin approval
- **RejectedChange** - Rejected changes with reasons

## 🎯 Core Business Logic

1. **Cross-Week Operations** - When users add/edit activities, they can apply changes across multiple weeks
2. **Approval Workflow** - Support users submit changes, admins approve/reject
3. **Visual Indicators** - Pending changes are clearly marked in the UI
4. **Audit Trail** - Complete history of all changes and rejections

## 🚀 Next Steps

After reviewing this foundation, the development will continue with:
1. Complete API implementation with cross-week logic
2. Frontend React application
3. PDF export functionality
4. Production deployment setup

The authentication system, database schema, and core infrastructure are ready for the full application build-out!
