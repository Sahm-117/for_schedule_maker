# Notifications System Plan

## Overview
Notify users via Email and Telegram when their pending changes are approved or rejected.

## Notification Triggers

### 1. **Change Approved** ✅
- **Who gets notified:** The user who submitted the change
- **Notification contains:**
  - Change type (ADD/EDIT/DELETE)
  - Activity description
  - Week number
  - Day name
  - Approved by (admin name)
  - Approved at (timestamp)

### 2. **Change Rejected** ❌
- **Who gets notified:** The user who submitted the change
- **Notification contains:**
  - Change type (ADD/EDIT/DELETE)
  - Activity description
  - Week number
  - Day name
  - Rejected by (admin name)
  - Rejection reason
  - Rejected at (timestamp)

## Technical Implementation

### Architecture
```
Backend API Endpoint (approve/reject)
    ↓
Notification Service
    ├── Email Service (Resend API)
    └── Telegram Service (Telegram Bot API)
```

### Option 1: Backend Implementation (Recommended)
**Pros:**
- Secure (API keys not exposed)
- Reliable delivery
- Better error handling
- Can retry failed notifications

**Tech Stack:**
- Node.js/Express backend endpoint
- Resend for email (or Nodemailer)
- Telegram Bot API

### Option 2: Supabase Edge Functions
**Pros:**
- Serverless
- Integrated with Supabase
- No separate backend needed

**Tech Stack:**
- Supabase Edge Functions (Deno)
- Database triggers or function calls
- Resend/Telegram APIs

### Option 3: Frontend (Not Recommended)
**Cons:**
- API keys exposed
- Less reliable
- No retry mechanism

## Recommended Approach

### Step 1: Add User Notification Preferences
Update `User` table to store:
- `email` (already exists)
- `telegramChatId` (optional, for Telegram notifications)
- `notificationPreferences` (JSON: { email: true, telegram: true })

### Step 2: Create Notification Service (Backend)
```typescript
// services/notifications.ts
interface NotificationData {
  userId: string;
  type: 'approved' | 'rejected';
  change: PendingChange;
  reason?: string;
  approvedBy?: string;
  rejectedBy?: string;
}

async function sendNotifications(data: NotificationData) {
  const user = await getUserById(data.userId);

  // Send email if user has email
  if (user.email && user.notificationPreferences?.email !== false) {
    await sendEmail({
      to: user.email,
      subject: `Change ${data.type}: ${data.change.changeData.description}`,
      template: data.type === 'approved' ? 'approved' : 'rejected',
      data: data
    });
  }

  // Send Telegram if user has chat ID
  if (user.telegramChatId && user.notificationPreferences?.telegram !== false) {
    await sendTelegramMessage({
      chatId: user.telegramChatId,
      message: formatTelegramMessage(data)
    });
  }
}
```

### Step 3: Email Templates (Resend)
```html
<!-- Approved Template -->
<h2>✅ Your Change Was Approved!</h2>
<p>Your request to {{changeType}} an activity has been approved.</p>

<div style="background: #f0f9ff; padding: 16px; border-radius: 8px;">
  <strong>Activity:</strong> {{description}}<br/>
  <strong>Week:</strong> {{weekNumber}}<br/>
  <strong>Day:</strong> {{dayName}}<br/>
  <strong>Approved by:</strong> {{approvedBy}}<br/>
  <strong>Time:</strong> {{approvedAt}}
</div>

<a href="{{appUrl}}" style="background: #10b981; color: white; padding: 12px 24px;">
  View Schedule
</a>
```

```html
<!-- Rejected Template -->
<h2>❌ Your Change Was Rejected</h2>
<p>Your request to {{changeType}} an activity has been rejected.</p>

<div style="background: #fef2f2; padding: 16px; border-radius: 8px;">
  <strong>Activity:</strong> {{description}}<br/>
  <strong>Week:</strong> {{weekNumber}}<br/>
  <strong>Day:</strong> {{dayName}}<br/>
  <strong>Rejected by:</strong> {{rejectedBy}}<br/>
  <strong>Reason:</strong> {{rejectionReason}}<br/>
  <strong>Time:</strong> {{rejectedAt}}
</div>

<a href="{{appUrl}}/history" style="background: #ef4444; color: white; padding: 12px 24px;">
  View Rejection Details
</a>
```

### Step 4: Telegram Bot Setup
1. Create bot with @BotFather on Telegram
2. Get bot token
3. Users can link their account by:
   - Sending `/start` to the bot
   - Bot asks for email/auth code
   - Bot saves chat ID to user profile

### Step 5: Integration Points
Update these API endpoints to trigger notifications:
- `pendingChangesApi.approve()` → Send "approved" notification
- `pendingChangesApi.reject()` → Send "rejected" notification

## Environment Variables Needed
```env
# Email (Resend)
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@yourdomain.com

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_BOT_URL=https://api.telegram.org/bot{token}

# App URLs
APP_URL=https://your-app.vercel.app
```

## User Flow

### Email Notification Flow:
1. Support user submits change → Pending
2. Admin approves/rejects → Trigger notification
3. Email sent to support user's email
4. User clicks link → Goes to app/history

### Telegram Notification Flow:
1. Support user links Telegram account (one-time setup)
   - Open bot → `/start`
   - Bot: "Enter your email to link account"
   - User: enters email
   - Bot saves chat ID to user profile
2. Admin approves/rejects → Trigger notification
3. Telegram message sent instantly
4. User clicks link → Opens app

## Quick Start Implementation

### Minimal Viable Notifications (Email Only)
1. Add email notification to backend API
2. Use Resend (free tier: 100 emails/day)
3. Simple text email (no fancy templates initially)
4. Integrate into approve/reject endpoints

### Phase 2: Telegram
1. Create Telegram bot
2. Add chat ID linking flow
3. Add Telegram notification alongside email

## Cost Considerations
- **Resend Free Tier:** 100 emails/day, 3,000/month
- **Telegram:** Completely free
- **Supabase Edge Functions:** Free tier: 500K invocations/month

## Questions to Answer
1. **Do you have a backend API?** Or should we use Supabase Edge Functions?
2. **Email service preference?** Resend, SendGrid, or Nodemailer?
3. **Do users need to opt-in?** Or notify everyone by default?
4. **Telegram linking flow?** How should users link their Telegram?

## Next Steps
Let me know:
1. Which implementation option you prefer (Backend vs Edge Functions)
2. If you want email first, then Telegram, or both together
3. Any specific design preferences for email templates