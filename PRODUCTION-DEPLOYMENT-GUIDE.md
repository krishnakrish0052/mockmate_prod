# MockMate Production Deployment Guide

## 🚀 Production Domains
- **Frontend**: https://mock-mate.com
- **Backend**: https://backend.mock-mate.com

## 📋 Pre-Deployment Checklist

### ✅ Completed
- [x] Code cleanup (184 unused files removed)
- [x] Payment fulfillment system fixed and tested
- [x] Production environment configurations created
- [x] Frontend production build created (1.86 MB optimized)

### 🔄 To Complete
- [ ] Database export and setup
- [ ] Domain configuration and SSL certificates
- [ ] Server deployment
- [ ] Environment-specific configurations

## 🗄️ Database Migration

### 1. Export Current Database

Run the provided PostgreSQL export script:

```powershell
.\export-database.ps1
```

This will create a timestamped backup file: `mockmate-production-backup-YYYY-MM-DD_HH-mm-ss.sql`

### 2. Production Database Setup

On your production server:

```bash
# Create production database
createdb -U postgres mockmate_production

# Create production user
psql -U postgres -c "CREATE USER mockmate_prod_user WITH PASSWORD 'your-secure-production-password';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE mockmate_production TO mockmate_prod_user;"

# Import database
psql -U postgres -d mockmate_production -f mockmate-production-backup-YYYY-MM-DD_HH-mm-ss.sql
```

## 🌐 Domain Configuration

### DNS Records Required

```
# A Records
mock-mate.com         → Your-Server-IP
backend.mock-mate.com → Your-Server-IP

# CNAME Records (optional, for www)
www.mock-mate.com → mock-mate.com
```

### SSL Certificates

Use Let's Encrypt for free SSL certificates:

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificates for both domains
sudo certbot --nginx -d mock-mate.com -d www.mock-mate.com -d backend.mock-mate.com
```

## 📦 Deployment Files

### Frontend (Static Files)
- **Source**: `./frontend/build/`
- **Deploy to**: Web server serving https://mock-mate.com
- **Size**: 1.86 MB (optimized)

### Backend (Node.js Application)
- **Source**: `./backend/`
- **Deploy to**: Server running https://backend.mock-mate.com
- **Port**: 3000 (internal, proxied through nginx/apache)

## ⚙️ Environment Configuration

### Backend Environment Variables

Copy and update `./backend/.env.production` with your actual production values:

**Critical Values to Update:**
```env
# Database
DB_HOST=your-production-db-host
DB_PASSWORD=your-secure-production-password
DATABASE_URL=postgresql://mockmate_prod_user:your-secure-production-password@your-production-db-host:5432/mockmate_production

# JWT Secrets (Generate new secure keys)
JWT_SECRET=your-super-secure-jwt-secret-key-for-production-minimum-32-characters
JWT_REFRESH_SECRET=your-super-secure-refresh-jwt-secret-key-for-production-minimum-32-characters

# Stripe Production Keys
STRIPE_SECRET_KEY=sk_live_your_production_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_production_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_production_webhook_secret

# Firebase Production Config
FIREBASE_PROJECT_ID=your-production-firebase-project
FIREBASE_PRIVATE_KEY="your-firebase-private-key"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xyz@your-production-firebase-project.iam.gserviceaccount.com

# Email Configuration
SMTP_HOST=your-smtp-host
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password
```

### Frontend Environment Variables

Copy and update `./frontend/.env.production` with your production values:

**Critical Values to Update:**
```env
# Firebase Production Config
VITE_FIREBASE_API_KEY=your-production-firebase-api-key
VITE_FIREBASE_PROJECT_ID=your-production-firebase-project

# Stripe Production Key
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your_production_stripe_publishable_key
```

## 🐳 Docker Deployment (Recommended)

### Backend Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

### Frontend Dockerfile
```dockerfile
FROM nginx:alpine

COPY ./build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### Docker Compose
```yaml
version: '3.8'

services:
  frontend:
    build: ./frontend
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./ssl:/etc/nginx/ssl
    
  backend:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - ./backend/.env.production
    depends_on:
      - database
      - redis
      
  database:
    image: postgres:15
    environment:
      POSTGRES_DB: mockmate_production
      POSTGRES_USER: mockmate_prod_user
      POSTGRES_PASSWORD: your-secure-production-password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      
  redis:
    image: redis:7-alpine
    command: redis-server --requirepass your-redis-password

volumes:
  postgres_data:
```

## 🔧 Nginx Configuration

### Frontend (mock-mate.com)
```nginx
server {
    listen 80;
    listen 443 ssl http2;
    server_name mock-mate.com www.mock-mate.com;
    
    ssl_certificate /etc/letsencrypt/live/mock-mate.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mock-mate.com/privkey.pem;
    
    location / {
        root /var/www/mock-mate.com;
        try_files $uri $uri/ /index.html;
        
        # Security headers
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";
    }
    
    # Static asset caching
    location /assets/ {
        root /var/www/mock-mate.com;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### Backend (backend.mock-mate.com)
```nginx
server {
    listen 80;
    listen 443 ssl http2;
    server_name backend.mock-mate.com;
    
    ssl_certificate /etc/letsencrypt/live/mock-mate.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mock-mate.com/privkey.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 🔒 Security Checklist

- [ ] Use HTTPS for all connections
- [ ] Enable security headers (HSTS, CSP, etc.)
- [ ] Configure firewalls (allow only 80, 443, 22)
- [ ] Set up fail2ban for SSH protection
- [ ] Use strong passwords and SSH keys
- [ ] Regular security updates
- [ ] Monitor logs for suspicious activity

## 🔍 Stripe Webhook Configuration

Set up webhooks in your Stripe dashboard:

1. Go to Stripe Dashboard > Webhooks
2. Add endpoint: `https://backend.mock-mate.com/api/payments/webhook`
3. Select events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `payment_intent.canceled`
4. Copy webhook secret to your environment variables

## 📊 Monitoring & Health Checks

### Health Check Endpoints
- Frontend: `https://mock-mate.com/` (should return 200)
- Backend: `https://backend.mock-mate.com/health` (should return 200)

### Log Monitoring
```bash
# Backend logs
tail -f /var/log/mockmate/backend.log

# Nginx access logs
tail -f /var/log/nginx/access.log

# System logs
journalctl -u mockmate-backend -f
```

## 🚀 Deployment Steps

### Step 1: Prepare Production Server
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required software
sudo apt install -y nginx postgresql redis-server nodejs npm git

# Install PM2 for process management
npm install -g pm2
```

### Step 2: Deploy Backend
```bash
# Clone repository
git clone https://github.com/your-username/mockmate.git /app/mockmate

# Install dependencies
cd /app/mockmate/backend
npm install --production

# Copy production environment
cp .env.production .env

# Start with PM2
pm2 start npm --name "mockmate-backend" -- start
pm2 save
pm2 startup
```

### Step 3: Deploy Frontend
```bash
# Copy build files
cp -r /app/mockmate/frontend/build/* /var/www/mock-mate.com/

# Set proper permissions
chown -R www-data:www-data /var/www/mock-mate.com/
```

### Step 4: Configure Services
```bash
# Configure nginx
sudo cp nginx-configs/mock-mate.com.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/mock-mate.com.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 🎯 Go-Live Checklist

- [ ] Database migrated and accessible
- [ ] Environment variables configured
- [ ] SSL certificates installed and valid
- [ ] DNS records pointing to server
- [ ] Both domains responding correctly
- [ ] Payment system tested with test transactions
- [ ] User registration and login working
- [ ] Admin panel accessible
- [ ] Email sending configured and tested
- [ ] Monitoring and logging configured
- [ ] Backup strategy implemented

## 🆘 Troubleshooting

### Common Issues

**Domain not accessible:**
- Check DNS propagation (up to 48 hours)
- Verify nginx configuration
- Check firewall rules

**SSL certificate errors:**
- Renew certificates: `sudo certbot renew`
- Check certificate validity: `openssl x509 -in cert.pem -text -noout`

**Database connection errors:**
- Verify DATABASE_URL format
- Check PostgreSQL service status
- Confirm user permissions

**Payment failures:**
- Verify Stripe webhook URL is accessible
- Check webhook secret matches
- Confirm production API keys are used

## 📞 Support

For deployment assistance:
- Check logs first: `/var/log/nginx/error.log`, PM2 logs
- Review environment variables
- Test individual components (database, Redis, etc.)

---

**MockMate Production Deployment**
Version: 1.0.0
Last Updated: $(Get-Date -Format "yyyy-MM-dd")
