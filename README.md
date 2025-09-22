# Gigachad Bot 💪

Transform any photo into a Gigachad masterpiece with AI-powered image transformation.

## Features

* 🎨 **5 Gigachad Styles**: OG Gigachad, Mog Chad, Cartoon Gigachad, Troll Gigachad, Brainrot Gigachad
* 📸 **Image Upload**: Upload any image format (jpg, png, gif, webp, etc.)
* 🔄 **True Image-to-Image**: Uses your actual uploaded photo as the base
* 💪 **Gigachad Transformation**: Adds exaggerated jawlines, muscles, and meme expressions
* 🌐 **Web Interface**: Beautiful website with scrollable quotes and wallpaper
* 📱 **Responsive**: Works on desktop and mobile

## How It Works

1. Upload an image
2. Choose a Gigachad style
3. The bot uses OpenAI's images/edits endpoint to transform your photo
4. Download your Gigachad masterpiece

## Local Development

1. Install dependencies:  
```bash
npm install
```

2. Create `.env` file with your OpenAI API key:  
```bash
OPENAI_API_KEY=your_api_key_here
```

3. Start the server:  
```bash
npm start
```

4. Open <http://localhost:3000>

## Deployment

### Render

1. Push your code to GitHub
2. Connect your GitHub repo to Render
3. Set environment variable: `OPENAI_API_KEY`
4. Deploy!

### Namecheap

1. Upload the files to your hosting
2. Run `npm install` on the server
3. Set environment variable: `OPENAI_API_KEY`
4. Start with `npm start`

## Environment Variables

* `OPENAI_API_KEY`: Your OpenAI API key (required)
* `PORT`: Port number (default: 3000)

## API Endpoints

* `GET /` - Main website with quotes
* `GET /bot` - Bot interface
* `POST /transform` - Transform image
* `GET /result/:imageId` - Get transformed image
* `GET /health` - Health check

## Technologies Used

* Node.js
* Express.js
* OpenAI API (images/edits)
* Multer (file uploads)
* HTML/CSS/JavaScript

## License

MIT

## About

Transform any photo into a Gigachad masterpiece. Stay sharp! 💪