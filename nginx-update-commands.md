# Nginx Configuration Update Commands

## 1. Backup current configuration
```bash
sudo cp /etc/nginx/sites-available/mockmate.com /etc/nginx/sites-available/mockmate.com.backup
```

## 2. Update the api.mock-mate.com server block

Replace the api.mock-mate.com server block in `/etc/nginx/sites-available/mockmate.com` with this configuration:

```nginx
server {
    server_name api.mock-mate.com;

    # Large file upload configuration
    client_max_body_size 500M;           # Allow up to 500MB uploads
    client_body_buffer_size 1M;          # Buffer size for reading client request body
    client_body_timeout 300s;            # Timeout for reading client request body
    client_header_timeout 60s;           # Timeout for reading client request header
    proxy_read_timeout 300s;             # Timeout for reading response from proxied server
    proxy_connect_timeout 60s;           # Timeout for establishing connection to proxied server
    proxy_send_timeout 300s;             # Timeout for transmitting request to proxied server

    # Enable request buffering for large uploads
    proxy_request_buffering on;
    proxy_buffering on;
    proxy_buffer_size 4k;
    proxy_buffers 8 4k;
    proxy_busy_buffers_size 8k;

    # CORS headers for all requests
    add_header 'Access-Control-Allow-Origin' 'https://mock-mate.com' always;
    add_header 'Access-Control-Allow-Credentials' 'true' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS, PATCH' always;
    add_header 'Access-Control-Allow-Headers' 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-File-Name, X-File-Hash' always;
    add_header 'Access-Control-Expose-Headers' 'Content-Length, X-File-Hash' always;

    # Handle preflight OPTIONS requests at nginx level
    if ($request_method = OPTIONS) {
        add_header 'Access-Control-Allow-Origin' 'https://mock-mate.com' always;
        add_header 'Access-Control-Allow-Credentials' 'true' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS, PATCH' always;
        add_header 'Access-Control-Allow-Headers' 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-File-Name, X-File-Hash' always;
        add_header 'Access-Control-Max-Age' 1728000 always;
        add_header 'Content-Type' 'text/plain; charset=utf-8' always;
        add_header 'Content-Length' 0 always;
        return 204;
    }

    # Special handling for upload endpoints with extended limits
    location /api/admin/apps/versions/upload {
        client_max_body_size 500M;
        client_body_timeout 600s;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;

        proxy_pass http://0.0.0.0:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Ensure CORS headers are always added for upload endpoint
        add_header 'Access-Control-Allow-Origin' 'https://mock-mate.com' always;
        add_header 'Access-Control-Allow-Credentials' 'true' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS, PATCH' always;
        add_header 'Access-Control-Allow-Headers' 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-File-Name, X-File-Hash' always;
    }

    # Test upload endpoint
    location /api/admin/apps/test-small-upload {
        proxy_pass http://0.0.0.0:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # All other API routes
    location / {
        proxy_pass http://0.0.0.0:5000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    access_log /var/log/nginx/backend.access.log;
    error_log /var/log/nginx/backend.error.log;

    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/api.mock-mate.com/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/api.mock-mate.com/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}
```

## 3. Test nginx configuration
```bash
sudo nginx -t
```

## 4. Reload nginx configuration
```bash
sudo systemctl reload nginx
```

## 5. Check nginx status
```bash
sudo systemctl status nginx
```

## 6. Monitor nginx error logs during upload testing
```bash
sudo tail -f /var/log/nginx/backend.error.log
```

## Key Changes Made:

1. **Added upload size limits**: `client_max_body_size 500M`
2. **Added CORS headers**: Proper headers for cross-origin requests
3. **Added OPTIONS handling**: Handle preflight requests at nginx level
4. **Extended timeouts**: 300-600 seconds for large uploads
5. **Special upload location**: Dedicated handling for upload endpoints
6. **Proper proxy headers**: Forward real client IP and protocol info

This should completely resolve the 413 errors and CORS issues!
