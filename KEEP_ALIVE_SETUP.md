# Keep-Alive Setup for FOF Scheduler

This document explains how to prevent the Supabase database from shutting down due to inactivity (7-day free tier limit).

## ✅ What's Been Added

1. **Keep-Alive API Route**: `/api/keep-alive`
   - Location: `backend/src/routes/keepAlive.ts`
   - Simple endpoint that queries the database to keep it active
   - Returns success status and timestamp

## 🚀 Setup Options

### Option 1: UptimeRobot (Recommended - Free & Easy)

1. Go to https://uptimerobot.com/
2. Create a free account
3. Click "Add New Monitor"
4. Configure:
   - **Monitor Type**: HTTP(s)
   - **Friendly Name**: FOF Scheduler Keep-Alive
   - **URL**: `https://your-backend-url.com/api/keep-alive`
   - **Monitoring Interval**: 5 days (432000 seconds) *Note: Free tier allows minimum 5 minutes, so you can use daily checks*
5. Click "Create Monitor"

**Recommended Setting**: Use **1 day (1440 minutes)** interval to safely stay under the 7-day limit.

### Option 2: Cron-Job.org (Free Alternative)

1. Go to https://cron-job.org/
2. Create a free account
3. Click "Create Cronjob"
4. Configure:
   - **Title**: FOF Keep-Alive
   - **Address**: `https://your-backend-url.com/api/keep-alive`
   - **Schedule**: Every 5 days at 00:00 (or daily for safety)
   - Use cron expression: `0 0 */5 * *`
5. Save the cron job

### Option 3: GitHub Actions (For GitHub-hosted projects)

Create `.github/workflows/keep-alive.yml`:

```yaml
name: Keep Database Alive

on:
  schedule:
    # Runs every 5 days at midnight UTC
    - cron: '0 0 */5 * *'
  workflow_dispatch: # Allows manual trigger

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping Keep-Alive Endpoint
        run: |
          curl -f https://your-backend-url.com/api/keep-alive || exit 1
```

### Option 4: Vercel Cron (If deploying backend to Vercel)

If you deploy the Express backend to Vercel, create `vercel.json` in the backend directory:

```json
{
  "crons": [
    {
      "path": "/api/keep-alive",
      "schedule": "0 0 */5 * *"
    }
  ]
}
```

Note: Vercel cron requires Hobby plan or higher ($20/month).

## 🧪 Testing the Endpoint

### Local Testing
```bash
cd backend
npm install
npm run dev

# In another terminal:
curl http://localhost:3000/api/keep-alive
```

Expected response:
```json
{
  "success": true,
  "message": "Database pinged successfully",
  "timestamp": "2025-11-30T01:47:00.000Z",
  "weekCount": 8
}
```

### Production Testing
```bash
curl https://your-backend-url.com/api/keep-alive
```

## 📊 Monitoring

Once set up, you can monitor the endpoint health:

1. **UptimeRobot**: Check the dashboard for uptime stats
2. **Cron-Job.org**: View execution history
3. **GitHub Actions**: Check workflow runs in the Actions tab

## 🔒 Security Notes

- The `/api/keep-alive` endpoint is public (no authentication required)
- It only performs a COUNT query, no sensitive data exposed
- Safe to call from any cron service

## 🎯 Recommended Approach

For the FOF Scheduler project, I recommend **UptimeRobot** because:
- ✅ Free forever
- ✅ Simple setup (5 minutes)
- ✅ Reliable monitoring
- ✅ Email alerts if endpoint goes down
- ✅ No GitHub Actions usage limits

Set the interval to **1 day** (well under the 7-day Supabase limit) for maximum safety.

## 📝 Cron Schedule Examples

- `0 0 */5 * *` - Every 5 days at midnight UTC
- `0 0 * * *` - Daily at midnight UTC (safest)
- `0 */12 * * *` - Every 12 hours
- `0 0 * * 0` - Every Sunday at midnight

## 🔄 Reusability

This same approach works for ANY project using:
- Supabase (PostgreSQL)
- Railway PostgreSQL
- Any database that auto-pauses due to inactivity

Just copy the `keepAlive.ts` route file and set up a cron service!
