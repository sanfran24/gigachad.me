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
  crossOriginEmbedderPolicy: false
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
  res.sendFile(path.join(__dirname, 'index.html'));
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
    server: 'Gigachad Bot',
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

// Style to prompt mapping (like original sleaze bot)
const styleToPrompt = {
  'og-gigachad': 'Transform this character into a Gigachad meme. Blend exaggerated Gigachad body and jawline with the original character\'s features. Wide, angular jaw but warped with the character\'s essence, bulging cheekbones, exaggerated eyebrow arch. Three-quarter angle, grayscale contrast, with Gigachad-style meme expression. Sculpted physique but absurd character grin dominating the face. Meme parody aesthetic, humorous and surreal. Background plain or dark gradient for focus.',
  'mog-chad': 'Transform this character into a Mog Chad meme. Blend exaggerated Gigachad body and jawline with the original character\'s features. Wide, angular jaw but warped with the character\'s essence, bulging cheekbones, exaggerated eyebrow arch. Three-quarter angle, grayscale contrast, with Mog-style meme expression. Sculpted physique but absurd character grin dominating the face. Meme parody aesthetic, humorous and surreal. Background plain or dark gradient for focus.',
  'cartoon-gigachad': 'Transform this character into a Cartoon Gigachad meme. Blend exaggerated Gigachad body and jawline with the original character\'s features. Wide, angular jaw but warped with the character\'s essence, bulging cheekbones, exaggerated eyebrow arch. Three-quarter angle, grayscale contrast, with cartoon-style meme expression. Sculpted physique but absurd character grin dominating the face. Meme parody aesthetic, humorous and surreal. Background plain or dark gradient for focus.',
  'troll-gigachad': 'Transform this character into a Troll Gigachad meme. Blend exaggerated Gigachad body and jawline with the trollface smirk. Wide, angular jaw but warped with mischievous grin, bulging cheekbones, exaggerated eyebrow arch. Three-quarter angle, grayscale contrast, with troll-style meme expression. Sculpted physique but absurd troll grin dominating the face. Meme parody aesthetic, humorous and surreal. Background plain or dark gradient for focus.',
  'brainrot-gigachad': 'Transform this character into a Brainrot Gigachad meme. Blend exaggerated Gigachad body and jawline with chaotic neon energy. Wide, angular jaw but warped with chaotic grin, bulging cheekbones, exaggerated eyebrow arch. Three-quarter angle, high contrast with neon colors, with brainrot-style meme expression. Sculpted physique but absurd chaotic grin dominating the face. Meme parody aesthetic, humorous and surreal. Background chaotic neon gradient for focus.'
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
    if (!req.file || !style) {
      return res.status(400).json({ success: false, error: 'Missing image or style' });
    }
    
    const prompt = styleToPrompt[style];
    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Unknown style' });
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
    await fs.promises.writeFile(outPath, Buffer.from(b64, 'base64'));

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
  
  if (fs.existsSync(resultPath)) {
    res.sendFile(resultPath);
  } else {
    res.status(404).json({ error: 'Result not found' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 Gigachad Bot server running on port ${PORT}`);
  console.log(`💪 Ready to transform images into Gigachad masterpieces!`);
});
