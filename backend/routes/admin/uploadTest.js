import express from 'express';
import multer from 'multer';
import { body, validationResult } from 'express-validator';
import { requirePermission } from '../../middleware/admin/adminAuth.js';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// Simple in-memory storage for testing
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { 
    fileSize: 100 * 1024 * 1024 // 100MB for testing
  }
});

// Manual CORS middleware for this route only
router.use((req, res, next) => {
  // Set CORS headers manually
  res.header('Access-Control-Allow-Origin', 'https://mock-mate.com');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-File-Name');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '86400');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// Test endpoint for CORS
router.get('/test-cors', (req, res) => {
  res.json({
    success: true,
    message: 'CORS test passed - manual headers working',
    origin: req.get('Origin'),
    timestamp: new Date().toISOString(),
    userAgent: req.get('User-Agent')
  });
});

// Test small file upload (no auth required for testing)
router.post('/test-upload', upload.single('testFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    res.json({
      success: true,
      message: 'File upload test successful',
      file: {
        name: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype,
        sizeFormatted: `${(req.file.size / 1024 / 1024).toFixed(2)}MB`
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Upload test failed',
      error: error.message
    });
  }
});

// Test with authentication
router.post('/test-upload-auth', 
  requirePermission(['app.write']),
  upload.single('testFile'), 
  (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded'
        });
      }

      res.json({
        success: true,
        message: 'Authenticated file upload test successful',
        user: req.user ? req.user.email : 'Unknown',
        file: {
          name: req.file.originalname,
          size: req.file.size,
          type: req.file.mimetype,
          sizeFormatted: `${(req.file.size / 1024 / 1024).toFixed(2)}MB`
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Authenticated upload test failed',
        error: error.message
      });
    }
  }
);

// Environment info
router.get('/env-info', (req, res) => {
  res.json({
    nodeEnv: process.env.NODE_ENV,
    corsOrigins: process.env.CORS_ORIGINS,
    uploadMaxSize: process.env.UPLOAD_MAX_SIZE,
    port: process.env.PORT,
    platform: process.platform,
    nodeVersion: process.version,
    timestamp: new Date().toISOString()
  });
});

export default router;
