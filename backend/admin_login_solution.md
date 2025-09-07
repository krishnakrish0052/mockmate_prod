# MockMate Admin Login 401 Error - Solution

## Problem
You're getting a `401 (Unauthorized)` error when trying to log in to the admin panel:
```
POST https://api.mock-mate.com/api/admin/login 401 (Unauthorized)
```

## Root Cause
The admin credentials being used by your frontend don't match the credentials stored in the database.

## Correct Admin Credentials

Based on our database investigation, the correct admin credentials are:

### Option 1: Username Login
- **Username**: `admin`
- **Password**: `admin123`

### Option 2: Email Login
- **Username**: `admin@mockmate.com` 
- **Password**: `admin123`

## What Was Wrong
Your `.env` file has `DEFAULT_ADMIN_PASSWORD=MockMateAdmin123!` but the actual password stored in the database hash corresponds to `admin123`. This mismatch occurs because:

1. The admin user was created with `admin123` as the password
2. The environment variable was later changed to `MockMateAdmin123!`
3. But the existing admin user's password wasn't updated

## Solutions

### Solution 1: Use Correct Credentials (Quickest)
Simply use the correct credentials in your frontend login form:
- Username: `admin`
- Password: `admin123`

### Solution 2: Update Admin Password in Database
If you want to use `MockMateAdmin123!` as the password, you can update the database:

```javascript
// Run this script to update the admin password
import bcrypt from 'bcryptjs';
import { initializeDatabase, getDatabase, closeDatabase } from './config/database.js';

async function updateAdminPassword() {
  await initializeDatabase();
  const db = getDatabase();
  
  const newPassword = 'MockMateAdmin123!';
  const passwordHash = await bcrypt.hash(newPassword, 12);
  
  await db.query(
    'UPDATE admin_users SET password_hash = $1 WHERE username = $2',
    [passwordHash, 'admin']
  );
  
  console.log('Admin password updated to:', newPassword);
  await closeDatabase();
}
```

### Solution 3: Create New Admin with Preferred Credentials
You can create a new admin user with your preferred credentials through the API once you log in with the current credentials.

## Testing the Fix

1. Try logging in with:
   - Username: `admin`
   - Password: `admin123`

2. If successful, you should receive:
   - Access token
   - Refresh token 
   - Admin user data with role `super_admin`

## Frontend Code Check

Make sure your frontend login form is sending the correct credentials. Check your admin login component for any hardcoded credentials or environment variables that might be overriding the user input.

## Additional Notes

- The admin user has `super_admin` role with full permissions
- The user is active (`is_active: true`)
- Both username and email can be used for login
- JWT tokens expire in 7 days based on your config

Try using the correct credentials (`admin` / `admin123`) and the 401 error should be resolved.
