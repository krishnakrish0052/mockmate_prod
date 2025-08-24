// Debug endpoint for testing CORS and upload issues
import express from 'express';
const router = express.Router();

// Test CORS preflight handling
router.options('/test-cors', (req, res) => {
  console.log('CORS Preflight Request Headers:', req.headers);
  
  res.set({
    'Access-Control-Allow-Origin': req.headers.origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': [
      'Content-Type', 
      'Authorization', 
      'X-Requested-With', 
      'Accept', 
      'Origin',
      'X-File-Name',
      'Cache-Control'
    ].join(', '),
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400'
  });
  
  res.status(200).end();
});

// Test CORS actual request
router.post('/test-cors', (req, res) => {
  res.json({
    success: true,
    message: 'CORS test passed',
    origin: req.headers.origin,
    method: req.method,
    headers: Object.keys(req.headers),
    timestamp: new Date().toISOString()
  });
});

// Test file upload limits
router.post('/test-upload-size', (req, res) => {
  const contentLength = req.headers['content-length'];
  const maxSize = 500 * 1024 * 1024; // 500MB
  
  console.log('Upload test:', {
    contentLength,
    maxSize,
    withinLimit: parseInt(contentLength) <= maxSize
  });
  
  res.json({
    success: true,
    contentLength: contentLength ? `${(parseInt(contentLength) / 1024 / 1024).toFixed(2)}MB` : 'Unknown',
    maxAllowed: '500MB',
    withinLimit: parseInt(contentLength || 0) <= maxSize,
    timestamp: new Date().toISOString()
  });
});

// Environment and configuration debug
router.get('/debug-config', (req, res) => {
  res.json({
    environment: process.env.NODE_ENV,
    corsOrigins: process.env.CORS_ORIGINS,
    frontendUrl: process.env.FRONTEND_URL,
    uploadMaxSize: process.env.UPLOAD_MAX_SIZE,
    serverPort: process.env.PORT,
    timestamp: new Date().toISOString(),
    headers: req.headers
  });
});

export default router;
