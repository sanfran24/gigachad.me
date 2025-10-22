const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const sharp = require('sharp');
const FormData = require('form-data');
const cluster = require('cluster');
const os = require('os');
const compression = require('compression');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Concurrency and performance optimizations
const MAX_CONCURRENT_REQUESTS = 20;
const REQUEST_TIMEOUT = 300000; // 5 minutes for user requests
const OPENAI_TIMEOUT = 240000; // 4 minutes for OpenAI API
const CLEANUP_INTERVAL = 30000; // Clean up every 30 seconds

// Request queue to handle concurrency
let activeRequests = 0;
const requestQueue = [];
const activeRequestTimers = new Map(); // Track request timeouts

// Basic CORS for all routes (allow Namecheap and other origins)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Cleanup system
setInterval(() => {
  // Clean up old temp files
  const tmpDir = path.join(__dirname, 'tmp');
  if (fs.existsSync(tmpDir)) {
    fs.readdir(tmpDir, (err, files) => {
      if (!err) {
        files.forEach(file => {
          const filePath = path.join(tmpDir, file);
          fs.stat(filePath, (err, stats) => {
            if (!err && Date.now() - stats.mtime.getTime() > 300000) { // 5 minutes old
              fs.unlink(filePath, () => {});
            }
          });
        });
      }
    });
  }
  
  // Clean up old results
  const resultsDir = path.join(__dirname, 'results');
  if (fs.existsSync(resultsDir)) {
    fs.readdir(resultsDir, (err, files) => {
      if (!err) {
        files.forEach(file => {
          const filePath = path.join(resultsDir, file);
          fs.stat(filePath, (err, stats) => {
            if (!err && Date.now() - stats.mtime.getTime() > 3600000) { // 1 hour old
              fs.unlink(filePath, () => {});
            }
          });
        });
      }
    });
  }
}, CLEANUP_INTERVAL);

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Performance middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for development
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' } // allow images to be embedded from other origins
}));
app.use(compression());

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static('public', {
  maxAge: '1d', // Cache static files for 1 day
  etag: true
}));

// Concurrency management middleware
app.use('/transform', (req, res, next) => {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  
  if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    return res.status(503).json({ 
      success: false, 
      error: 'Server is at capacity (20 users). Please try again in a moment.',
      queuePosition: requestQueue.length + 1,
      estimatedWaitTime: Math.ceil((requestQueue.length + 1) * 3) // 3 minutes per request estimate
    });
  }
  
  activeRequests++;
  console.log(`[${requestId}] Request started. Active: ${activeRequests}/${MAX_CONCURRENT_REQUESTS}`);
  
  // Set request timeout with cleanup
  const timeoutId = setTimeout(() => {
    activeRequests--;
    activeRequestTimers.delete(requestId);
    console.log(`[${requestId}] Request timeout after ${REQUEST_TIMEOUT}ms`);
    if (!res.headersSent) {
      res.status(408).json({ 
        success: false, 
        error: 'Request timeout - image processing took longer than 5 minutes. Please try again.',
        timeout: true
      });
    }
  }, REQUEST_TIMEOUT);
  
  activeRequestTimers.set(requestId, timeoutId);
  
  // Clean up on response
  const originalEnd = res.end;
  res.end = function(...args) {
    activeRequests--;
    const timer = activeRequestTimers.get(requestId);
    if (timer) {
      clearTimeout(timer);
      activeRequestTimers.delete(requestId);
    }
    console.log(`[${requestId}] Request completed. Active: ${activeRequests}/${MAX_CONCURRENT_REQUESTS}`);
    originalEnd.apply(this, args);
  };
  
  // Add request ID to request object for logging
  req.requestId = requestId;
  next();
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'image-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'bot.html'));
});

app.get('/bot', (req, res) => {
  res.sendFile(path.join(__dirname, 'bot.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    activeRequests: activeRequests,
    maxConcurrent: MAX_CONCURRENT_REQUESTS,
    queueLength: requestQueue.length
  });
});

// Status endpoint for monitoring
app.get('/status', (req, res) => {
  res.json({
    server: 'BNB Wojackk Bot',
    status: 'running',
    activeRequests: activeRequests,
    maxConcurrent: MAX_CONCURRENT_REQUESTS,
    queueLength: requestQueue.length,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

// Progress endpoint for users to check their request status
app.get('/progress/:requestId', (req, res) => {
  const { requestId } = req.params;
  
  if (activeRequestTimers.has(requestId)) {
    res.json({
      status: 'processing',
      message: 'Your image is being transformed...',
      activeRequests: activeRequests,
      maxConcurrent: MAX_CONCURRENT_REQUESTS
    });
  } else {
    res.json({
      status: 'not_found',
      message: 'Request not found or completed',
      activeRequests: activeRequests
    });
  }
});

// Style to prompt mapping
const styleToPrompt = {
  'saiyan-bnb': "Apply this to the [character]: high-energy Super Saiyan transformation with vivid anime style and crisp linework. Subject is centered, three-quarter angle, powerful yet composed expression. Identity retention: keep the person's identity and features; do not change ethnicity. Preserve facial geometry and landmarks (eye shape, nose, mouth, jawline, cheekbones), skin tone, and overall hairstyle/hairline. Allow gravity-defying spiky hair styling with a golden highlight while keeping the hairline/shape recognizable; do not obscure the face. Keep the original pose and clothing (enhance with subtle folds/lighting only). Surround the subject with a bright golden aura, soft bloom, and subtle lightning arcs; add upward motion lines and a faint upward stock chart in the background for momentum. Use Binance yellow #F0B90B for aura/lightning accents; avoid covering the face with effects. Background softly defocused; emphasize depth and dynamic lighting; 1024x1024 composition. No face replacement, no age/gender changes, no heavy filters that blur facial details.",
  'purple-laser-eyes': "Add intense glowing purple laser eyes to [CHARACTER], positioned naturally over their real eyes. The beams should match the shape, glow, and brightness of the purple laser eyes in the reference image — vibrant neon violet, with radiating light streaks and a soft glow around them. The rest of the image (lighting, colors, background, facial features, clothing, etc.) must remain completely unchanged and realistic — only the laser eyes are modified. Make sure the laser effect feels integrated with the lighting of the scene and aligned perfectly with the subject's eye direction."
};

// Transform endpoint (matching original sleaze bot structure)
app.post('/transform', upload.single('image'), async (req, res) => {
  try {
    console.log(`[${req.requestId}] Transform request:`, {
      hasFile: !!req.file,
      fileMimetype: req.file?.mimetype,
      fileSize: req.file?.size,
      style: req.body.style,
      activeRequests: activeRequests
    });

    const style = req.body.style;
    if (!req.file || (!style && !req.body.prompt)) {
      return res.status(400).json({ success: false, error: 'Missing image or style/prompt' });
    }

    // Fallback: if style is not a known key, treat it as a raw prompt or use req.body.prompt
    let prompt = style ? styleToPrompt[style] : undefined;
    if (!prompt) {
      if (typeof style === 'string' && style.trim().length > 0 && !styleToPrompt[style]) {
        // Allow raw prompt passed in the style field
        prompt = style;
      } else if (typeof req.body.prompt === 'string' && req.body.prompt.trim().length > 0) {
        prompt = req.body.prompt;
      }
    }
    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Unknown style or empty prompt' });
    }

    // True img2img: convert upload to PNG RGBA and send to images/edits (exactly like original sleaze bot)
    const pngBuffer = await sharp(req.file.path)
      .resize(1024, 1024, { fit: 'cover' })
      .ensureAlpha()
      .png()
      .toBuffer();

    // Write temp file for SDK stream with proper extension
    if (!fs.existsSync('tmp')) {
      fs.mkdirSync('tmp');
    }
    const tmpPng = path.join(__dirname, 'tmp', `${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
    await fs.promises.writeFile(tmpPng, pngBuffer);

    let b64;
    try {
      // Use form-data with proper file handling (exactly like original sleaze bot)
      const formData = new FormData();
      formData.append('image', pngBuffer, {
        filename: 'image.png',
        contentType: 'image/png'
      });
      
      // Note: Reference image functionality removed for now to fix API compatibility
      
      formData.append('prompt', prompt);
      formData.append('size', '1024x1024');
      formData.append('n', '1');
      formData.append('model', 'gpt-image-1');
      
      console.log(`[${req.requestId}] Calling OpenAI images/edits endpoint...`);
      
      const response = await axios.post('https://api.openai.com/v1/images/edits', formData, {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        timeout: OPENAI_TIMEOUT,
        maxRedirects: 3
      });
      
      console.log(`[${req.requestId}] OpenAI response received successfully`);
      
      const resp = response.data;
      b64 = resp?.data?.[0]?.b64_json;
      const url = resp?.data?.[0]?.url;
      if (!b64 && url) {
        // Fallback: download URL to buffer
        const arr = await (await fetch(url)).arrayBuffer();
        b64 = Buffer.from(arr).toString('base64');
      }
    } catch (err) {
      console.error('OpenAI edit error:', err.response?.status, err.response?.data || err.message);
      
      // Clean up temp file on error
      if (fs.existsSync(tmpPng)) {
        fs.unlink(tmpPng, () => {});
      }
      
      // Return appropriate error based on type
      if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
        return res.status(408).json({ success: false, error: 'Request timeout - please try again' });
      } else if (err.response?.status === 429) {
        return res.status(429).json({ success: false, error: 'Rate limit exceeded - please wait a moment' });
      } else {
        return res.status(500).json({ success: false, error: err.response?.data || err.message });
      }
    } finally {
      // Clean up temp file
      if (fs.existsSync(tmpPng)) {
        fs.unlink(tmpPng, () => {});
      }
    }

    if (!b64) {
      return res.status(500).json({ success: false, error: 'No image data from OpenAI' });
    }

    // Create results directory
    if (!fs.existsSync('results')) {
      fs.mkdirSync('results');
    }
    
    const imageId = `${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
    const outPath = path.join(__dirname, 'results', imageId);
    
    console.log(`[${req.requestId}] Saving image with ID: ${imageId}`);
    console.log(`[${req.requestId}] Full path: ${outPath}`);
    
    await fs.promises.writeFile(outPath, Buffer.from(b64, 'base64'));
    
    console.log(`[${req.requestId}] Image saved successfully. File exists: ${fs.existsSync(outPath)}`);

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    console.log(`[${req.requestId}] Transform completed successfully. Image ID: ${imageId}`);
    return res.json({ 
      success: true, 
      image_id: imageId,
      request_id: req.requestId,
      processing_time: Date.now() - parseInt(req.requestId.split('-')[0])
    });
  } catch (e) {
    console.error('Transform error:', e);
    return res.status(500).json({ success: false, error: e.message });
  }
});

// Get result image (matching original sleaze bot)
app.get('/result/:imageId', (req, res) => {
  const { imageId } = req.params;
  const resultPath = path.join(__dirname, 'results', imageId);
  
  // Allow embedding image from other origins
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  res.header('Cross-Origin-Embedder-Policy', 'unsafe-none');

  console.log(`[RESULT] Requesting image: ${imageId}`);
  console.log(`[RESULT] Full path: ${resultPath}`);
  console.log(`[RESULT] File exists: ${fs.existsSync(resultPath)}`);
  
  if (fs.existsSync(resultPath)) {
    console.log(`[RESULT] Serving image: ${imageId}`);
    res.sendFile(resultPath);
  } else {
    console.log(`[RESULT] Image not found: ${imageId}`);
    res.status(404).json({ error: 'Result not found', imageId: imageId });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 BNB Wojackk Bot server running on port ${PORT}`);
  console.log(`💪 Ready to transform images into BNB Wojackk masterpieces!`);
});
