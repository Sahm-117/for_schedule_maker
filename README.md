# FOF Schedule Manager 📅

> Foundation of Faith (FOF) is an 8-week church discipleship programme. This application allows support team members to collaboratively edit weekly schedules, with admin approval for changes.

## 🚀 Live Demo

**Production:** [https://fof-schedule-manager.vercel.app](https://fof-schedule-manager.vercel.app)

> Contact administrator for access credentials

## ✨ Features

### 🔐 Authentication & User Management
- JWT-based authentication with secure password hashing
- Role-based access control (Admin/Support)
- User management dashboard with role assignment
- Protected System Admin account

### 📋 Schedule Management
- **8-week programme structure** with daily schedules
- **Time-based periods**: Morning, Afternoon, Evening (auto-determined)
- **Activity ordering**: Reorder activities with same time slot
- **Cross-week operations**: Apply activities to multiple weeks at once
- **Multi-week editing**: Update/delete activities across multiple weeks
- **PDF Export**: Export individual weeks or all weeks at once

### 🔄 Workflow & Approvals
- **Pending Changes System**: Support users submit change requests
- **Admin Approval Dashboard**: Review and approve/reject changes
- **Rejection History**: Track rejected changes with reasons
- **Change History Panel**: View all approved/rejected changes
- **Email & Telegram Notifications**: Get notified of important events

### 📱 UX/UI Features
- **Fully responsive design** optimized for mobile, tablet, and desktop
- **Toast notifications** for user feedback
- **Loading states** with skeleton loaders
- **Empty states** with helpful prompts
- **Accessibility features** (ARIA labels, keyboard navigation)
- **Mobile-optimized layouts**: Card views for better mobile experience
- **Visual indicators** for pending changes and activity status

### 🔔 Notification System
- **Email notifications** via Resend API
- **Telegram notifications** via Telegram Bot API
- **Configurable settings** per admin user
- **Event types**: Change requests, approvals, rejections, mentions

## 🏗 Tech Stack

### Frontend
- **React 18** + **TypeScript**
- **Vite** for fast development
- **Tailwind CSS** for styling
- **jsPDF** + **html2canvas** for PDF export
- **DOMPurify** for XSS protection

### Backend
- **Node.js** + **Express**
- **TypeScript** for type safety
- **Prisma ORM** with PostgreSQL
- **JWT authentication**
- **bcrypt** for password hashing

### Infrastructure
- **Supabase** (PostgreSQL database)
- **Vercel** (Frontend hosting)
- **Render** (Backend hosting - if used)
- **Supabase Edge Functions** for notifications

## 📦 Installation & Setup

### Prerequisites
- Node.js 18+
- PostgreSQL database (or Supabase account)
- Telegram Bot Token (optional, for notifications)
- Resend API Key (optional, for email notifications)

### 1. Clone the Repository
```bash
git clone <your-repo-url>
cd FOF_SOP_Scheduler
```

### 2. Backend Setup
```bash
cd backend
npm install

# Create .env file
cp .env.example .env
```

#### Configure Backend Environment Variables
```env
# Database
DATABASE_URL="postgresql://user:password@host:5432/database"

# JWT Secrets (generate strong random strings)
JWT_SECRET="your-secure-jwt-secret-min-32-chars"
JWT_REFRESH_SECRET="your-secure-refresh-secret-min-32-chars"

# CORS
FRONTEND_URL="https://your-frontend-url.vercel.app"

# Server
PORT=3000
NODE_ENV="production"

# Notifications (Optional)
TELEGRAM_BOT_TOKEN="your-telegram-bot-token"
RESEND_API_KEY="your-resend-api-key"
```

#### Initialize Database
```bash
# Run migrations
npx prisma migrate deploy

# Seed initial data (creates admin user and 8 weeks)
npm run db:seed

# Start server
npm start
```

### 3. Frontend Setup
```bash
cd frontend
npm install

# Create .env file
cp .env.example .env
```

#### Configure Frontend Environment Variables
```env
VITE_API_URL=https://your-backend-url.com/api
```

#### Build & Deploy
```bash
# Development
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

### 4. Supabase Edge Functions (Optional - for notifications)
```bash
cd supabase/functions

# Install Supabase CLI
brew install supabase/tap/supabase

# Login and link project
supabase login
supabase link --project-ref your-project-ref

# Set secrets
supabase secrets set TELEGRAM_BOT_TOKEN="your-token"
supabase secrets set RESEND_API_KEY="your-key"
supabase secrets set DATABASE_URL="your-db-url"

# Deploy functions
supabase functions deploy send-notification
```

## 🗂 Project Structure

```
for_schedule_maker/
├── backend/                  # Express API server
│   ├── src/
│   │   ├── routes/          # API endpoints
│   │   ├── middleware/      # Authentication & authorization
│   │   ├── services/        # External integrations (email, telegram)
│   │   └── utils/           # Helper functions
│   ├── prisma/              # Database schema & migrations
│   └── README.md            # Backend documentation
│
├── frontend/                 # React frontend
│   ├── src/
│   │   ├── components/      # React components (24 components)
│   │   ├── pages/           # Page components (Login, Dashboard)
│   │   ├── services/        # API clients
│   │   ├── hooks/           # Custom React hooks
│   │   ├── types/           # TypeScript definitions
│   │   └── utils/           # PDF export, etc.
│   └── README.md            # Frontend documentation
│
├── scripts/                  # Utility scripts (organized)
│   ├── database-utilities/  # DB maintenance scripts
│   ├── team-migration/      # Team color tagging migration
│   ├── documentation/       # Detailed guides
│   ├── archive/             # Backup files
│   └── README.md            # Scripts documentation
│
├── database-migrations/      # Manual SQL migrations
│   ├── supabase-schema-update.sql
│   └── README.md            # Migration guide
│
├── deployment/               # Deployment configurations
│   ├── Dockerfile           # Docker setup
│   ├── fly.toml             # Fly.io config
│   ├── railway.toml         # Railway config
│   ├── render.yaml          # Render config
│   └── README.md            # Deployment guide
│
├── supabase/
│   └── functions/           # Edge Functions for notifications
│
├── .gitignore
├── README.md                # This file (main documentation)
├── SECURITY_AUDIT_REPORT.md # Security audit results
└── TEAM_COLOR_TAGGING_STATUS.md # Team feature status
```

**Key Documentation:**
- `/backend/README.md` - Backend API setup and routes
- `/frontend/README.md` - Frontend components and features
- `/scripts/README.md` - Utility scripts organization
- `/database-migrations/README.md` - Database migration guide
- `/deployment/README.md` - Platform-specific deployment
- `/SECURITY_AUDIT_REPORT.md` - Security review findings
- `/TEAM_COLOR_TAGGING_STATUS.md` - Team feature implementation status

## 🔑 Default Users

After seeding, default admin users are created. Contact your system administrator for credentials.

**Security Note:** Always change default passwords immediately after first deployment!

## 🧪 API Endpoints

### Authentication
- `POST /api/auth/login` - Login with email/phone and password
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Get current user

### Users (Admin only)
- `GET /api/users` - List all users
- `POST /api/users` - Create new user
- `PUT /api/users/:id/role` - Update user role
- `DELETE /api/users/:id` - Delete user

### Weeks
- `GET /api/weeks` - Get all weeks
- `GET /api/weeks/:id` - Get specific week with days and activities
- `POST /api/weeks` - Create new week (Admin only)

### Activities
- `POST /api/activities` - Create activity (Admin only)
- `POST /api/activities/request` - Request activity (Support users)
- `PUT /api/activities/:id` - Update activity
- `DELETE /api/activities/:id` - Delete activity
- `PUT /api/activities/:id/reorder` - Reorder activity
- `POST /api/activities/check-duplicates` - Check if activity exists in other weeks

### Pending Changes
- `GET /api/pending-changes/week/:weekId` - Get pending changes for week
- `GET /api/pending-changes` - Get all pending changes (Admin only)
- `POST /api/pending-changes` - Create pending change
- `PUT /api/pending-changes/:id/approve` - Approve change (Admin only)
- `PUT /api/pending-changes/:id/reject` - Reject change with reason (Admin only)

### Rejected Changes
- `GET /api/rejected-changes/mine` - Get my rejected changes
- `PUT /api/rejected-changes/:id/read` - Mark as read

## 📱 Features in Detail

### Multi-Week Operations

#### Delete Across Weeks
When deleting an activity that exists in multiple weeks:
1. Admin clicks delete on an activity
2. System checks if the same activity (time + description) exists in other weeks
3. If found in multiple weeks, shows selection modal
4. Admin selects which weeks to delete from
5. Activity is deleted only from selected weeks

#### Edit Across Weeks
When editing an activity:
1. System shows which weeks have this activity (blue badges)
2. Checkbox: "Update in all X existing weeks"
3. If checked: updates all instances (ignores week selector)
4. If unchecked: only updates current instance

### Notification Settings
Each admin can configure:
- Email notifications (requires verified Resend domain)
- Telegram notifications (requires bot token)
- Notification preferences per event type

### PDF Export
- **Export Week**: Export current week's schedule
- **Export All Weeks**: Export all 8 weeks in one PDF
- Dropdown menu for easy access
- Professional formatting with time-based sections

## 🛡 Security Features

- **Password hashing** with bcrypt
- **JWT authentication** with refresh tokens
- **Protected routes** with role-based access
- **XSS protection** with DOMPurify
- **CORS** configured for frontend domain
- **System Admin protection** (cannot be deleted)
- **Input validation** on all endpoints

## 🚀 Deployment

### Frontend (Vercel)
1. Push code to GitHub
2. Connect repository to Vercel
3. Set environment variable: `VITE_API_URL`
4. Deploy

### Backend (Render/Railway/etc.)
1. Create new web service
2. Set environment variables (DATABASE_URL, JWT secrets, etc.)
3. Deploy

### Database (Supabase)
1. Create new project
2. Copy DATABASE_URL from settings
3. Run migrations: `npx prisma migrate deploy`
4. Seed data: `npm run db:seed`

## 📝 License

MIT License - feel free to use this project for your church or organization!

## 🤝 Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## 📚 Quick Reference

### Common Commands

**Backend:**
```bash
cd backend
npm run dev          # Start dev server
npm run build        # Build for production
npx prisma migrate dev  # Create migration
npx prisma db:seed   # Seed database
```

**Frontend:**
```bash
cd frontend
npm run dev          # Start dev server
npm run build        # Build for production
npm run preview      # Preview build
```

**Scripts:**
```bash
cd scripts/database-utilities
node test-connection.js    # Test DB connection
node find-duplicates.js    # Find duplicate activities

cd ../team-migration
node migrate-teams-from-descriptions.js  # Migrate teams
```

### File Locations

- **Environment configs:** `backend/.env`, `frontend/.env`
- **Database schema:** `backend/prisma/schema.prisma`
- **API routes:** `backend/src/routes/`
- **React components:** `frontend/src/components/`
- **Type definitions:** `frontend/src/types/index.ts`
- **Deployment configs:** `deployment/`
- **Migration scripts:** `scripts/team-migration/`

### Getting Help

- **Setup issues:** See `/backend/README.md` or `/frontend/README.md`
- **Database issues:** See `/database-migrations/README.md`
- **Script usage:** See `/scripts/README.md`
- **Deployment:** See `/deployment/README.md`
- **Security:** See `/SECURITY_AUDIT_REPORT.md`
- **Team features:** See `/TEAM_COLOR_TAGGING_STATUS.md`

---

Built with ❤️ for the Foundation of Faith Programme
