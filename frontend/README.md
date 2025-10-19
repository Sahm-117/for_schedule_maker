# FOF Schedule Manager - Frontend

React 18 + TypeScript + Vite frontend for the FOF Schedule Manager.

## Directory Structure

```
frontend/
├── src/
│   ├── main.tsx             # App entry point
│   ├── App.tsx              # Router setup
│   ├── index.css            # Global styles (Tailwind)
│   ├── components/          # React components
│   │   ├── ActivityModal.tsx          # Add/Edit activities
│   │   ├── ActivityCard.tsx           # Activity display card
│   │   ├── CrossWeekModal.tsx         # Multi-week operations
│   │   ├── MultiWeekDeleteModal.tsx   # Delete from multiple weeks
│   │   ├── DaySchedule.tsx            # Single day view
│   │   ├── ScheduleView.tsx           # Full week view
│   │   ├── WeekSelector.tsx           # Week navigation
│   │   ├── PendingChangesPanel.tsx    # Admin approval panel
│   │   ├── RejectedChangesNotification.tsx # Support notifications
│   │   ├── HistoryPanel.tsx           # Change history
│   │   ├── UserManagement.tsx         # User CRUD (admin)
│   │   ├── TeamManagement.tsx         # Team CRUD (admin)
│   │   ├── TeamSelector.tsx           # Team multi-select
│   │   ├── TeamModal.tsx              # Add/Edit teams
│   │   ├── TeamBadge.tsx              # Team color badge
│   │   ├── ColorPicker.tsx            # Color selection
│   │   ├── SearchBar.tsx              # Global search
│   │   ├── OnboardingWalkthrough.tsx  # Interactive tour
│   │   ├── WelcomeModal.tsx           # First-time welcome
│   │   ├── QuickStartChecklist.tsx    # Getting started guide
│   │   ├── ConfirmationModal.tsx      # Generic confirmation
│   │   ├── LoadingSpinner.tsx         # Loading state
│   │   ├── Toast.tsx                  # Toast notifications
│   │   └── ProtectedRoute.tsx         # Auth wrapper
│   ├── pages/               # Page components
│   │   ├── Login.tsx        # Authentication page
│   │   └── Dashboard.tsx    # Main application
│   ├── hooks/               # Custom React hooks
│   │   ├── useAuth.tsx      # Authentication context
│   │   └── useToast.tsx     # Toast notification hook
│   ├── services/            # API clients
│   │   ├── api.ts           # Main API client (dual mode)
│   │   ├── supabase-api.ts  # Supabase direct client
│   │   └── notifications.ts # Notification service
│   ├── types/               # TypeScript definitions
│   │   └── index.ts         # All type definitions
│   ├── utils/               # Utility functions
│   │   └── pdfExport.ts     # PDF generation
│   ├── lib/                 # Third-party configs
│   │   └── supabase.ts      # Supabase client setup
│   └── assets/              # Static assets
├── public/
│   └── logo.png             # App logo
├── dist/                    # Build output
├── .env.example             # Environment template
├── index.html               # HTML entry point
├── vite.config.ts           # Vite configuration
├── tailwind.config.js       # Tailwind CSS config
├── postcss.config.js        # PostCSS config
└── tsconfig.json            # TypeScript config
```

## Quick Start

### Installation
```bash
npm install
```

### Environment Setup
```bash
cp .env.example .env
# Add your backend API URL
```

Required `.env` variables:
```env
VITE_API_URL=https://your-backend-url.com/api

# OR if using Supabase directly:
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Development
```bash
npm run dev  # Starts dev server at http://localhost:5173
```

### Production Build
```bash
npm run build   # Build for production
npm run preview # Preview production build
```

## Features

### Core Features
- **8-Week Schedule Management** - Navigate and manage 8 weeks of schedules
- **Day-by-Day View** - Sunday through Saturday organized by time periods
- **Activity CRUD** - Create, read, update, delete activities
- **Cross-Week Operations** - Apply changes to multiple weeks at once
- **Multi-Week Editing** - Update activities across selected weeks
- **Multi-Week Deletion** - Delete from specific weeks only

### Workflow Features
- **Approval System** - Support users submit, admins approve/reject
- **Rejection Notifications** - Support users see why changes were rejected
- **Change History** - Track all approved and rejected changes
- **Pending Changes Panel** - Admin dashboard for approvals

### Team Features
- **Team Color Tagging** - Assign colored team badges to activities
- **Team Management** - Create, edit, delete teams (admin only)
- **Team Selection** - Multi-select teams when creating activities
- **Team Badges** - Visual team indicators throughout the app

### User Experience
- **Onboarding Tour** - Interactive walkthrough for new users
- **Quick Start Checklist** - Post-onboarding task list
- **Global Search** - Search activities across all weeks
- **Auto-Scroll & Highlight** - Navigate to search results
- **PDF Export** - Export individual weeks or all weeks
- **Mobile Responsive** - Optimized for phone, tablet, desktop
- **Toast Notifications** - User feedback for all actions
- **Loading States** - Skeleton loaders and spinners
- **Empty States** - Helpful prompts when no data

### Admin Features
- **User Management** - Create, edit, delete users
- **Role Assignment** - Set users as Admin or Support
- **Direct Editing** - Changes apply immediately without approval
- **Approval Dashboard** - Review and approve/reject changes
- **Team Management** - Full CRUD for teams

### Support Features
- **Change Requests** - Submit changes for admin approval
- **Rejection History** - See rejected changes with reasons
- **Read Receipts** - Mark rejections as read
- **Cross-Week Requests** - Request changes across multiple weeks

## Component Architecture

### Pages
- `Login` - Authentication form with validation
- `Dashboard` - Main app layout with week selector + schedule + panels

### Layout Components
- `WeekSelector` - Sidebar week navigation
- `ScheduleView` - Week container with 7 days
- `DaySchedule` - Single day with activities grouped by period
- `ActivityCard` - Individual activity display with edit/delete

### Modal Components
- `ActivityModal` - Add/Edit activities (supports cross-week)
- `CrossWeekModal` - Apply activities to multiple weeks
- `MultiWeekDeleteModal` - Delete from selected weeks
- `TeamModal` - Add/Edit teams
- `UserManagement` - Full user CRUD modal
- `ConfirmationModal` - Generic yes/no dialog

### Panel Components
- `PendingChangesPanel` - Admin approval interface
- `RejectedChangesNotification` - Support notification banner
- `HistoryPanel` - Change history viewer
- `TeamManagement` - Team CRUD interface

### Onboarding Components
- `WelcomeModal` - First-time user greeting
- `OnboardingWalkthrough` - Step-by-step tour
- `QuickStartChecklist` - Getting started tasks

### Utility Components
- `ProtectedRoute` - Auth wrapper for authenticated routes
- `LoadingSpinner` - Reusable loading indicator
- `Toast` - Notification toast component
- `TeamBadge` - Team color badge
- `ColorPicker` - Color selection UI
- `SearchBar` - Global search with dropdown

## State Management

### Authentication
- `useAuth` hook provides:
  - `user` - Current user object
  - `isAdmin` - Admin role check
  - `login()` - User login
  - `logout()` - User logout
  - `completeOnboarding()` - Mark onboarding as complete
  - `replayOnboarding()` - Show tour again

### Toast Notifications
- `useToast` hook provides:
  - `showToast(message, type)` - Show toast notification
  - Types: `success`, `error`, `warning`, `info`

### Local State
- Component-level state with `useState`
- Form state in modals
- Loading states for async operations
- Error states for user feedback

## API Integration

### Dual API Mode
The app supports two modes:
1. **Custom Backend** - Express API (production)
2. **Supabase Direct** - Direct Supabase calls (alternative)

Configured via `VITE_API_URL` or `VITE_SUPABASE_URL` environment variables.

### API Services
- `authApi` - Login, register, token refresh
- `weeksApi` - Week operations
- `activitiesApi` - Activity CRUD, duplicates, reorder
- `pendingChangesApi` - Submit, approve, reject
- `rejectedChangesApi` - Get rejections, mark read
- `usersApi` - User CRUD (admin only)
- `teamsApi` - Team CRUD, assign to activities

## Styling

### Tailwind CSS
- Utility-first CSS framework
- Custom theme in `tailwind.config.js`
- Color palette:
  - Primary: Blue (`#3B82F6`)
  - Success: Green (`#10B981`)
  - Warning: Orange (`#F59E0B`)
  - Danger: Red (`#EF4444`)

### Responsive Design
- Mobile-first approach
- Breakpoints: `sm:640px`, `md:768px`, `lg:1024px`, `xl:1280px`
- Card layouts for mobile
- Table layouts for desktop

## PDF Export

Uses `jsPDF` + `html2canvas` to generate PDFs:
- Individual week export
- All weeks export (batch)
- Formatted with time periods
- Includes team colors (when implemented)

Location: `src/utils/pdfExport.ts`

## TypeScript Types

All types defined in `src/types/index.ts`:
- `User` - User object with role
- `Week` - Week with days
- `Day` - Day with activities
- `Activity` - Activity with time, description, teams
- `Team` - Team with name and color
- `PendingChange` - Change request
- `RejectedChange` - Rejection with reason
- `AuthResponse` - Login response

## Development Tips

### Hot Module Replacement (HMR)
Vite provides instant updates during development. Changes to `.tsx` files reload immediately.

### Type Checking
```bash
npm run build-with-types  # Build with TypeScript type checking
```

### Linting
```bash
npm run lint  # ESLint
```

### Component Testing
Use React DevTools to inspect component state and props.

## Deployment (Vercel)

1. Connect GitHub repository to Vercel
2. Set framework preset: **Vite**
3. Set root directory: `frontend`
4. Add environment variable: `VITE_API_URL`
5. Deploy

Auto-deploys on push to main branch.

## Troubleshooting

### "VITE_API_URL is not defined"
Add to `.env` file in `frontend/` directory.

### "Network Error" or CORS issues
Check `VITE_API_URL` points to correct backend and CORS is configured.

### Build errors
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

### TypeScript errors
```bash
npm run build-with-types  # Shows detailed errors
```

## Performance Optimization

- Code splitting with React.lazy (future)
- Memoization with React.memo (where needed)
- Debounced search input
- Optimistic UI updates for better UX

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile Safari (iOS 14+)
- Chrome Mobile (Android 8+)

## Accessibility

- ARIA labels on interactive elements
- Keyboard navigation support
- Focus management in modals
- Screen reader friendly
- Semantic HTML

---

**Backend API:** See `/backend/README.md`
**Scripts:** See `/scripts/README.md`
**Deployment:** See `/deployment/README.md`
