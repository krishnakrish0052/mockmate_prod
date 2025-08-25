# Production Email URL Fix

## Problem
Email verification links in new user registration emails are pointing to `localhost:3000` instead of the production domain `https://mock-mate.com`.

## Root Cause
The `system_config` table in the production database has localhost URLs stored, which override the environment variables.

## Solution

### Step 1: Upload the Fix Script to Production Server

1. Upload the file `production-fix-frontend-urls.js` to your production server backend directory
2. Make sure your production `.env` file has the correct `DATABASE_URL` configured

### Step 2: Run the Fix Script on Production

SSH into your production server and run:

```bash
# Navigate to your backend directory
cd /path/to/your/backend

# Run the production fix script
node production-fix-frontend-urls.js
```

### Step 3: Verify the Fix

The script will:
1. Show current (incorrect) URL configurations
2. Update all URLs to production domains
3. Verify the changes
4. Test a sample verification URL

Expected output:
```
🎉 SUCCESS: Email verification URLs will now use production domain!

📧 Email Template Impact:
  ❌ Before: http://localhost:3000/verify-email?token=...
  ✅ After:  https://mock-mate.com/verify-email?token=...
```

### Step 4: Restart Your Application (Recommended)

To ensure the configuration changes take effect immediately:

```bash
# If using PM2
pm2 restart your-app-name

# If using Docker
docker restart your-container-name

# Or however you restart your Node.js application
```

## What Gets Updated

The script updates these database configurations:

| Configuration | Before | After |
|---------------|---------|-------|
| `frontend_url` | `http://localhost:3000` | `https://mock-mate.com` |
| `api_url` | `http://localhost:5000` | `https://backend.mock-mate.com` |
| `admin_url` | `http://localhost:5000` | `https://mock-mate.com/admin` |
| `websocket_url` | `http://localhost:5000` | `https://backend.mock-mate.com` |

## Testing the Fix

After applying the fix:

1. **Test new user registration**: Create a new user account
2. **Check the verification email**: The verification link should now point to `https://mock-mate.com/verify-email?token=...`
3. **Verify functionality**: The verification link should work properly when clicked

## Rollback (if needed)

If you need to rollback the changes, you can manually update the database:

```sql
-- Connect to your production database and run:
UPDATE system_config SET config_value = '"http://localhost:3000"' WHERE config_key = 'frontend_url';
UPDATE system_config SET config_value = '"http://localhost:5000"' WHERE config_key = 'api_url';
UPDATE system_config SET config_value = '"http://localhost:5000"' WHERE config_key = 'admin_url';  
UPDATE system_config SET config_value = '"http://localhost:5000"' WHERE config_key = 'websocket_url';
```

## Important Notes

- ✅ This fix only affects **new** verification emails sent after the fix
- ✅ Existing verification tokens will still work (they use the same endpoint)
- ✅ No code changes required - only database configuration updates
- ⚠️ Make sure to backup your database before running the script
- 🔄 Consider restarting your application after applying the fix

## Support

If you encounter any issues:

1. Check that your `DATABASE_URL` environment variable is correctly set
2. Ensure your production database is accessible
3. Verify that the `system_config` table exists and has the expected structure
4. Check application logs for any errors after restarting
