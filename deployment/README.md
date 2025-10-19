# Deployment Configuration

This directory contains deployment configuration files for various hosting platforms.

## Available Configurations

### Backend Deployment

**Fly.io** (`fly.toml`)
- Lightweight container deployment
- Auto-scaling support
- Global edge locations

**Railway** (`railway.toml`)
- Simple git-based deployment
- Built-in PostgreSQL
- Auto-deploy on push

**Render** (`render.yaml`)
- Managed services
- Free tier available
- Automatic SSL

**Docker** (`Dockerfile`)
- Containerized deployment
- Works with any Docker-compatible platform
- Useful for local development

## Quick Start

### Fly.io Deployment
```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Deploy backend
cd ../backend
fly launch --config ../deployment/fly.toml
fly deploy
```

### Railway Deployment
```bash
# Install Railway CLI
npm install -g @railway/cli

# Deploy
railway login
railway init
railway up
```

### Render Deployment
1. Connect your GitHub repository to Render
2. Select "Blueprint" and point to `deployment/render.yaml`
3. Configure environment variables
4. Deploy

### Docker Deployment
```bash
# Build image
cd ../backend
docker build -f ../deployment/Dockerfile -t fof-backend .

# Run container
docker run -p 3000:3000 --env-file .env fof-backend
```

## Environment Variables Required

All deployment platforms require these environment variables:

```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/database

# JWT Secrets
JWT_SECRET=your-secure-jwt-secret-min-32-chars
JWT_REFRESH_SECRET=your-secure-refresh-secret-min-32-chars

# CORS
FRONTEND_URL=https://your-frontend-url.vercel.app

# Optional: Notifications
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
RESEND_API_KEY=your-resend-api-key
```

## Frontend Deployment (Vercel)

The frontend is deployed separately to Vercel:

1. Connect GitHub repository to Vercel
2. Set framework preset: **Vite**
3. Set root directory: `frontend`
4. Add environment variable: `VITE_API_URL=https://your-backend-url.com/api`
5. Deploy

## Production Checklist

- [ ] Environment variables configured
- [ ] Database migrations applied (`npx prisma migrate deploy`)
- [ ] Database seeded with initial data (`npm run db:seed`)
- [ ] CORS configured with production frontend URL
- [ ] JWT secrets are strong (32+ characters)
- [ ] HTTPS enforced
- [ ] Health check endpoint working (`/api/health`)

## Monitoring

After deployment, monitor:
- Application logs
- Database connection pool
- API response times
- Error rates

---

**Current Production:**
- Frontend: Vercel
- Backend: [Your platform]
- Database: Supabase (PostgreSQL)
