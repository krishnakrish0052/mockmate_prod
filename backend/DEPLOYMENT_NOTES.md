# MockMate Backend Deployment Notes

## CORS Configuration

The server supports CORS configuration through environment variables. To add new allowed origins:

### Method 1: Environment Variable
Add origins to the `CORS_ORIGINS` environment variable in your `.env` file:

```bash
CORS_ORIGINS=http://localhost:3000,http://localhost:5173,https://mock-mate.com,http://199.192.27.155:5000
```

### Method 2: Individual Variables
You can also use individual environment variables:

```bash
CORS_ORIGIN=http://your-specific-origin.com
FRONTEND_URL=https://your-frontend-domain.com
```

## Common Issues and Solutions

### CORS Blocking Errors
If you see errors like: `❌ CORS: Blocking origin: http://199.192.27.155:5000`

**Solution**: Add the blocked origin to your `CORS_ORIGINS` environment variable.

### Timer Endpoint 500 Errors
If you see 500 errors on `/api/sessions/:sessionId/timer`:

1. Check database connection
2. Verify user authentication token
3. Ensure session exists and belongs to the authenticated user

### Email Service SMTP Timeouts
If you see SMTP connection timeouts:

1. Verify SMTP credentials in `.env`:
   ```bash
   SMTP_HOST=smtpout.secureserver.net
   SMTP_PORT=587
   SMTP_USER=admin@mock-mate.com
   SMTP_PASS=your_password
   ```

2. Test network connectivity to SMTP server
3. Check firewall settings

## Server Status Monitoring

### Check if server is running:
```bash
netstat -an | findstr :5000
```

### View active Node processes:
```powershell
Get-Process | Where-Object {$_.ProcessName -match "node"}
```

### Start server:
```bash
cd backend
npm start
```

### Start in development mode:
```bash
cd backend
npm run dev
```

## Environment Variables

Key environment variables to configure:

- `PORT`: Server port (default: 5000)
- `NODE_ENV`: Environment (development/production)
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_HOST`, `REDIS_PORT`: Redis configuration
- `CORS_ORIGINS`: Comma-separated list of allowed origins
- `SMTP_*`: Email service configuration
- `JWT_SECRET`: JWT token secret

## Database Setup

Ensure your PostgreSQL database is accessible:

```bash
# Test database connection
npm run db:check

# Run migrations
npm run migrate

# Seed database
npm run seed
```

## Security Notes

- Never commit `.env` files to git
- Use strong JWT secrets in production
- Configure CORS restrictively for production
- Use HTTPS in production environments
- Keep SMTP credentials secure

## Troubleshooting

1. **Server won't start**: Check environment variables and database connectivity
2. **CORS errors**: Add origins to CORS_ORIGINS
3. **Database errors**: Verify DATABASE_URL and network access
4. **Email errors**: Test SMTP configuration
5. **Session issues**: Check JWT configuration and Redis connectivity
