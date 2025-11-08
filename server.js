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
  'purple-laser-eyes': "Add intense glowing purple laser eyes to [CHARACTER], positioned naturally over their real eyes. The beams should match the shape, glow, and brightness of the purple laser eyes in the reference image — vibrant neon violet, with radiating light streaks and a soft glow around them. The rest of the image (lighting, colors, background, facial features, clothing, etc.) must remain completely unchanged and realistic — only the laser eyes are modified. Make sure the laser effect feels integrated with the lighting of the scene and aligned perfectly with the subject's eye direction.",
  'stonks-red': "Transform [CHARACTER] into the classic 'Stonks' meme with a RED declining stock chart. Keep the person's identity and facial features intact. Add a confident, smug expression with a slight smirk. Place a prominent red declining stock chart/graph in the background showing a downward trend with red lines and red negative numbers. The chart should be clearly visible and professional-looking. Add text elements like 'STONKS' in bold letters. The overall mood should be ironically confident despite the red declining chart. Keep the person's original clothing but enhance it slightly. Background should be clean and professional with the red chart prominently displayed.",
  'stonks-green': "Transform [CHARACTER] into the classic 'Stonks' meme with a GREEN rising stock chart. Keep the person's identity and facial features intact. Add a confident, triumphant expression with a big smile. Place a prominent green rising stock chart/graph in the background showing an upward trend with green lines and green positive numbers. The chart should be clearly visible and professional-looking. Add text elements like 'STONKS' in bold letters. The overall mood should be confidently triumphant with the green rising chart. Keep the person's original clothing but enhance it slightly. Background should be clean and professional with the green chart prominently displayed.",
  'pixel-bull': "Transform the subject in this image into Freakbob. Keep the same pose and composition as the original subject.",
  'freakbob': "Transform the subject in this uploaded image into the McDonald's employee character from the 'Just put my fries in the bag bro' meme. The uploaded person becomes the fast-food worker being told 'Just put my fries in the bag bro' by an aggressive customer. CRITICAL STYLE REQUIREMENTS: The background and environment must be PHOTOREALISTIC and look like a real McDonald's restaurant - the fast-food counter, register, menu boards, restaurant interior, lighting, and all environmental elements should appear completely realistic and photographic. However, the CHARACTER (the McDonald's employee) must be drawn in a CARTOON or ANIMATED style - like a character from an animated show or cartoon, with stylized features and bold outlines. IDENTITY RETENTION IS MANDATORY: preserve the uploaded person's exact facial structure, proportions, skin tone, eye shape, nose, mouth, jawline, hairline, hair color/texture, and any facial hair or accessories; do not change age, gender, or ethnicity. The subject (as the McDonald's employee) should be standing behind a fast-food counter, wearing a McDonald's uniform (red polo shirt, red cap with yellow M logo), with a distressed or confused facial expression as someone off-camera or to the side is aggressively telling them 'Just put my fries in the bag bro'. The scene should look exactly like the viral meme format - fast-food restaurant setting with counter, register, menu boards visible in the background. The uploaded person's facial features and appearance should be preserved but rendered in cartoon/animated style while they become the employee in this exact meme scenario, so the output is instantly recognizable as the same person. Keep the same camera angle and composition as the original 'Just put my fries in the bag bro' meme - the employee looks distressed/confused while being confronted. The contrast between the photorealistic background and cartoon character should be striking and clear.",
  'fiona': "Transform the subject in this image into Freaky Fiona — a feminine, confident, charismatic Shrek/Fiona-themed character with a strong, seductive presence and powerful, alluring pose. Freaky Fiona must always have the exact same appearance: Princess Fiona-inspired features adapted into a feminine seductive form (distinctive facial structure, expressive eyes), feminine muscular build with curves, distinctive Fiona-style characteristics, signature look, unique style, and recognizable characteristics that remain identical in every generation. The character design, Fiona-themed aesthetic, facial features, feminine body proportions, clothing style, and overall appearance must be completely consistent across all outputs — like the same character from a series or franchise. Only vary the pose, expression intensity, and background to match the input image, but keep Freaky Fiona's core feminine identity and appearance absolutely the same. Make it bold, confident, and seductive in a feminine way within appropriate bounds — think strong, confident female model pose, powerful feminine physique with curves, suggestive but tasteful positioning, intense feminine expression, and stylish feminine presentation."
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

    console.log(`[${req.requestId}] Using prompt for style "${style}":`, prompt.substring(0, 100) + '...');

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
