# MockMate Database Schema Information

## 📊 Production Database Setup

### Database Details
- **Database Name**: `mockmate_production`
- **User**: `mockmate_prod_user`
- **PostgreSQL Version**: 17+
- **Required Extensions**: `pgcrypto`, `uuid-ossp`

### Key Tables (Schema Structure)
- `users` - User accounts and authentication
- `sessions` - Interview sessions
- `interview_messages` - Chat messages and AI responses
- `interview_questions` - Generated questions
- `interview_answers` - User responses and scoring
- `user_resumes` - Uploaded resume data
- `payments` - Stripe payment records
- `admin_users` - Administrative accounts
- `system_configurations` - App settings

### Required Setup Commands

```sql
-- Create production database
CREATE DATABASE mockmate_production;

-- Create production user
CREATE USER mockmate_prod_user WITH ENCRYPTED PASSWORD 'your-secure-production-password';

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE mockmate_production TO mockmate_prod_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mockmate_prod_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO mockmate_prod_user;

-- Enable required extensions
\c mockmate_production
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

## 🔒 Security Notes

**The actual database backup file contains:**
- ✅ Complete schema with all tables, indexes, and functions
- ✅ All production data including user accounts
- ✅ Encrypted passwords and sensitive information
- ⚠️ API keys and secrets (Stripe, Firebase, etc.)

**File Location**: `mockmate-production-backup-2025-08-23_21-53-15.sql` (0.54 MB)

## 📋 Production Deployment Steps

1. **Transfer backup file securely** to production server
2. **Create production database** and user with commands above
3. **Import backup**: `psql -U postgres -d mockmate_production -f mockmate-production-backup-2025-08-23_21-53-15.sql`
4. **Update environment variables** in production
5. **Test database connectivity** from application

## 📁 File Management

The database backup file is intentionally **excluded from Git** for security reasons:
- Contains sensitive user data
- Includes API keys and secrets
- Should be transferred directly to production server
- Use secure file transfer methods (SCP, encrypted cloud storage)

**Never commit database backups with real data to version control!**
