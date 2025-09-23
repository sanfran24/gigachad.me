const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const sharp = require('sharp');
const FormData = require('form-data');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

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
    console.log('Transform request:', {
      hasFile: !!req.file,
      fileMimetype: req.file?.mimetype,
      fileSize: req.file?.size,
      style: req.body.style
    });

    const style = req.body.style;
    if (!req.file || !style) {
      return res.status(400).json({ success: false, error: 'Missing image or style' });
    }
    
    const prompt = styleToPrompt[style];
    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Unknown style' });
    }

    // Use DALL-E 3 generations with enhanced prompt for better transformation
    console.log('Using DALL-E 3 generations with enhanced prompt...');
    
    let b64;
    try {
      const response = await axios.post('https://api.openai.com/v1/images/generations', {
        model: 'dall-e-3',
        prompt: `${prompt}. Transform the uploaded image into this style. Maintain the original person's features but apply the Gigachad transformation.`,
        n: 1,
        size: '1024x1024',
        quality: 'standard'
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      const resp = response.data;
      const url = resp?.data?.[0]?.url;
      
      if (!url) {
        return res.status(500).json({ success: false, error: 'No image data from OpenAI' });
      }
      
      // Download image from URL
      const imageResponse = await fetch(url);
      const imageBuffer = await imageResponse.arrayBuffer();
      b64 = Buffer.from(imageBuffer).toString('base64');
      
    } catch (err) {
      console.error('OpenAI generation error:', err.response?.status, err.response?.data || err.message);
      return res.status(500).json({ success: false, error: err.response?.data || err.message });
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

    return res.json({ success: true, image_id: imageId });
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
