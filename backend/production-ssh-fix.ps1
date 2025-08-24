# Production Server SSH Connection and Fix Script
$serverIP = "199.192.27.155"
$username = "root"
$password = "wRMsK975wa3hWV08z"
$backendPath = "/var/www/mm/mockmate_prod/backend"

Write-Host "🚀 Connecting to MockMate Production Server..." -ForegroundColor Green
Write-Host "Server: $serverIP" -ForegroundColor Yellow
Write-Host "Backend Path: $backendPath" -ForegroundColor Yellow

# Note: This script outlines the SSH commands to run
# You'll need to execute these commands manually via SSH client

Write-Host "`n📋 SSH Commands to run on production server:" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

$commands = @"
# 1. Connect to server
ssh root@199.192.27.155

# 2. Navigate to backend directory
cd /var/www/mm/mockmate_prod/backend

# 3. Check current PM2 status
pm2 list

# 4. Check if our diagnostic file exists, if not create it
ls -la production-diagnostics.js

# 5. Run production diagnostics
NODE_ENV=production node production-diagnostics.js

# 6. Check current sessions.js file (backup first)
cp routes/sessions.js routes/sessions.js.backup.$(date +%Y%m%d_%H%M%S)

# 7. Check database connection
pm2 logs mockmate --lines 50

# 8. Check production environment
cat .env.production | head -20

"@

Write-Host $commands -ForegroundColor White

Write-Host "`n🔧 Next Steps:" -ForegroundColor Green
Write-Host "1. Open your SSH client (PuTTY, Terminal, etc.)" -ForegroundColor White
Write-Host "2. Connect using the credentials above" -ForegroundColor White
Write-Host "3. Run the commands listed above" -ForegroundColor White
Write-Host "4. Share the output of the diagnostics" -ForegroundColor White
