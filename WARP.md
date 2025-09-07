# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## 🏗️ Architecture Overview

MockMate is an AI-powered interview platform with a unified full-stack architecture:

### Core Components
- **Backend**: Express.js/Node.js API server with PostgreSQL database
- **Frontend**: React/TypeScript with Vite build system and Tailwind CSS
- **Admin Panel**: Integrated admin interface for platform management
- **Email System**: MJML-based templating with terminal CLI theme
- **Desktop App**: Native desktop application integration
- **Payment Processing**: Multi-provider payment gateway system (Stripe, Cashfree)
- **Real-time Features**: Socket.IO for live interactions
- **Analytics**: Custom analytics system for user behavior tracking

### Key Services Architecture
- **Dynamic Configuration Service**: Runtime configuration management
- **Firebase Integration**: Authentication and real-time database
- **Email Template Engine**: Template-based email generation with variables
- **Payment Services**: Unified payment processing with health checks
- **Alert System**: Real-time notifications and system alerts
- **Background Services**: Scheduled tasks and timers

## 🚀 Development Commands

### Backend Development
```bash
# Navigate to backend
cd backend

# Install dependencies
npm install

# Development with hot reload
npm run dev

# Production start
npm start

# Database operations
npm run db:check        # Check database connection
npm run migrate         # Run database migrations
npm run seed           # Seed initial data
npm run db:setup       # Full database setup

# Code quality
npm run lint           # Run ESLint
npm run lint:fix       # Fix ESLint issues
npm run format         # Format with Prettier
npm run format:check   # Check formatting

# Testing
npm test              # Run tests
```

### Frontend Development
```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Development server (with hot reload)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Code quality
npm run lint           # Run ESLint
npm run lint:fix       # Fix ESLint issues
npm run format         # Format with Prettier
npm run format:check   # Check formatting
npm run type-check     # TypeScript type checking

# Testing
npm test              # Run Vitest
npm run test:ui       # Run tests with UI
npm run test:coverage # Run tests with coverage
```

### Email Template Development
```bash
# Email templates are in /email-templates directory
# Test template compilation with debug endpoint:
curl http://localhost:5001/api/debug-templates

# Import templates to database:
curl -X POST http://localhost:5001/api/import-email-templates
```

### Production Deployment
```bash
# Backend production setup
cd backend
cp .env.production .env
npm install --production
pm2 start npm --name "mockmate-backend" -- start

# Frontend production build
cd frontend
npm run build
# Copy build/ contents to web server

# Database export for production
./export-database.ps1  # Windows
```

## 🗄️ Database Architecture

### Core Tables
- **users**: User authentication and profile data
- **sessions**: Interview session records
- **resumes**: Resume storage and processing
- **email_templates**: Template management system
- **payment_configurations**: Dynamic payment provider settings
- **system_configurations**: Runtime configuration values
- **user_profiles**: Extended user profile information
- **analytics_events**: User behavior tracking
- **alerts**: System alert management

### Key Database Patterns
- UUID primary keys for most entities
- JSON columns for flexible configuration storage
- Soft deletes with `deleted_at` timestamps
- Audit trails with `created_at`/`updated_at`
- Dynamic configuration through key-value pairs

## 🔧 Configuration Management

### Environment Variables
**Backend (.env)**:
```env
# Database
DATABASE_URL=postgresql://user:pass@host:port/database
DB_HOST=localhost
DB_USER=mockmate_user
DB_PASSWORD=your_password

# Authentication
JWT_SECRET=your-jwt-secret
JWT_REFRESH_SECRET=your-refresh-secret

# Payment Providers
STRIPE_SECRET_KEY=sk_test_...
CASHFREE_CLIENT_ID=your_cashfree_id
CASHFREE_CLIENT_SECRET=your_cashfree_secret

# Firebase
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="your-private-key"
FIREBASE_CLIENT_EMAIL=service-account@project.iam.gserviceaccount.com

# Email
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

**Frontend (.env)**:
```env
# API Configuration
VITE_API_BASE_URL=http://localhost:5001
VITE_API_URL=http://localhost:5001/api

# Firebase Client
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_PROJECT_ID=your-project-id

# Payment
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### Dynamic Configuration
The system uses a runtime configuration service that loads settings from the database. Key configurations include:
- CORS origins
- Payment provider settings  
- Feature flags
- Email settings
- Icon and branding assets

## 🎨 Email Template System

### Template Structure
Templates use a terminal/CLI theme with dark backgrounds and developer-friendly fonts. All templates extend from `base-template.html`.

### Key Templates
- **Authentication**: Welcome, verification, password reset
- **Notifications**: Interview invitations, reminders, completion
- **Billing**: Payment confirmations, subscription updates
- **System**: Status updates, maintenance notices

### Template Variables
Templates use Mustache syntax (`{{VARIABLE_NAME}}`). Common variables include:
- `{{USER_NAME}}`, `{{USER_EMAIL}}`
- `{{INTERVIEW_DATE}}`, `{{INTERVIEW_TIME}}`  
- `{{COMPANY_NAME}}`, `{{POSITION}}`
- `{{AMOUNT}}`, `{{PAYMENT_METHOD}}`

## 🔌 API Architecture

### Authentication Flow
1. User registration/login via Firebase Auth
2. Backend validates Firebase tokens
3. Issues JWT tokens for API access
4. Admin routes protected by role-based middleware

### Key API Patterns
- RESTful endpoints with consistent response format
- Middleware chain: CORS → Auth → Validation → Controller
- Error handling with structured error responses
- Rate limiting and security headers
- File upload handling with multer
- WebSocket integration for real-time features

### Admin API Structure
All admin routes are prefixed with `/api/admin/` and require admin authentication:
- `/api/admin/users` - User management
- `/api/admin/analytics` - Analytics dashboard
- `/api/admin/email-templates` - Template management
- `/api/admin/payment-configs` - Payment settings
- `/api/admin/system` - System configuration

## 🚨 Common Development Patterns

### Error Handling
```javascript
// Standard error response format
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {...}
}
```

### Database Queries
- Use parameterized queries to prevent SQL injection
- Include error handling and connection cleanup
- Use transactions for multi-step operations
- Implement proper pagination for list endpoints

### Frontend State Management
- Zustand for global state management
- React Query for API state and caching
- Context providers for feature-specific state
- Custom hooks for reusable logic

### Payment Integration
The system supports multiple payment providers through a unified interface:
- Dynamic provider routing based on region/currency
- Webhook handling for payment confirmations
- Health checking for provider availability
- Fallback mechanisms for provider failures

## 🔍 Testing Strategy

### Backend Testing
- Unit tests for services and utilities
- Integration tests for API endpoints  
- Database tests with transaction rollback
- Mock external services (Stripe, Firebase)

### Frontend Testing
- Component testing with React Testing Library
- Hook testing for custom hooks
- E2E tests for critical user flows
- Visual regression testing for UI components

## 🚀 Deployment Architecture

### Production Setup
- **Frontend**: Static build served via CDN/nginx
- **Backend**: Node.js on PM2 with nginx reverse proxy
- **Database**: PostgreSQL with connection pooling
- **Redis**: Session storage and caching
- **SSL**: Let's Encrypt certificates for HTTPS

### Docker Support
Both frontend and backend have Dockerfile configurations for containerized deployment.

### Environment Separation
- Development: Local database and services
- Staging: Shared staging environment
- Production: Separate production infrastructure with monitoring

## 🔧 Troubleshooting Common Issues

### Database Connection Issues
- Check `DATABASE_URL` format and credentials
- Verify PostgreSQL service is running
- Test connection with `npm run db:check`

### CORS Issues
- Verify frontend URL in backend CORS configuration
- Check environment variables for allowed origins
- Use `/api/cors-test` endpoint to debug CORS setup

### Payment Processing Issues
- Verify webhook endpoints are accessible
- Check payment provider credentials
- Use health check endpoints to verify provider status

### Email Template Issues
- Check template directory path resolution
- Verify database connection for template storage
- Use `/api/debug-templates` for troubleshooting

## 📚 Key Files and Directories

### Backend Structure
- `server.js` - Main application entry point
- `config/` - Database, Redis, logging configuration
- `routes/` - API route definitions  
- `services/` - Business logic and external integrations
- `middleware/` - Authentication, validation, analytics
- `migrations/` - Database schema changes

### Frontend Structure  
- `src/admin/` - Admin panel components and pages
- `src/webapp/` - Main user-facing application
- `src/components/` - Shared UI components
- `src/services/` - API client and utilities
- `src/contexts/` - React context providers

### Configuration Files
- `package.json` - Dependencies and scripts
- `.env.production` - Production environment variables
- `nginx.conf` - Web server configuration
- `PRODUCTION-DEPLOYMENT-GUIDE.md` - Detailed deployment instructions
