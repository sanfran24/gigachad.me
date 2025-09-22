const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

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
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Transform endpoint
app.post('/transform', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const { style } = req.body;
    if (!style) {
      return res.status(400).json({ error: 'No style provided' });
    }

    console.log('Transform request:', { 
      filename: req.file.filename, 
      style: style,
      size: req.file.size 
    });

    // Read the uploaded image
    const imageBuffer = fs.readFileSync(req.file.path);
    
    // Create form data for OpenAI
    const FormData = require('form-data');
    const openaiFormData = new FormData();
    openaiFormData.append('image', imageBuffer, {
      filename: req.file.filename,
      contentType: req.file.mimetype
    });
    
    // Create a simple white mask (1x1 white pixel)
    const whitePixelBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const maskBuffer = Buffer.from(whitePixelBase64, 'base64');
    openaiFormData.append('mask', maskBuffer, {
      filename: 'mask.png',
      contentType: 'image/png'
    });
    
    openaiFormData.append('prompt', style);
    openaiFormData.append('size', '1024x1024');
    openaiFormData.append('n', '1');

    console.log('Calling OpenAI images/edits endpoint...');
    
    // Call OpenAI images/edits endpoint
    const response = await axios.post('https://api.openai.com/v1/images/edits', openaiFormData, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        ...openaiFormData.getHeaders()
      }
    });

    console.log('OpenAI response received:', !!response.data);

    const resp = response.data;
    const b64 = resp?.data?.[0]?.b64_json;

    if (!b64) {
      return res.status(500).json({ error: 'No image data from OpenAI' });
    }

    // Save the result
    const resultId = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const resultPath = path.join(__dirname, 'results', `result-${resultId}.png`);
    
    if (!fs.existsSync('results')) {
      fs.mkdirSync('results');
    }
    
    fs.writeFileSync(resultPath, Buffer.from(b64, 'base64'));
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({ 
      success: true, 
      resultId: resultId,
      message: 'Gigachad transformation complete!' 
    });

  } catch (error) {
    console.error('Transform error:', error);
    
    // Clean up uploaded file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      error: 'Transform failed', 
      details: error.message 
    });
  }
});

// Get result image
app.get('/result/:imageId', (req, res) => {
  const { imageId } = req.params;
  const resultPath = path.join(__dirname, 'results', `result-${imageId}.png`);
  
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
