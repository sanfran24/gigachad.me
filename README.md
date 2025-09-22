# 💪 Gigachadify Bot

Transform any photo into a Gigachad meme with AI-powered image generation.

## Features
- 🎨 5 different Gigachad transformation styles
- 🖼️ AI-powered image generation using OpenAI
- 📱 Responsive design
- 🎭 Scattered animated quotes
- 🖼️ Custom wallpaper background

## Live Demo
- **Main Site**: [Your Namecheap Domain]
- **Bot**: [Your Render URL]

## Tech Stack
- Next.js 14
- TypeScript
- OpenAI API
- Tailwind CSS

## Local Development

1. **Clone the repository**
   ```bash
   git clone [your-repo-url]
   cd gigachadify-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   # Add your OPENAI_API_KEY to .env.local
   ```

4. **Run development server**
   ```bash
   npm run dev
   ```

## Deployment on Render

1. **Connect to Render**
   - Link your GitHub repository
   - Or upload the code directly

2. **Environment Variables**
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   NODE_ENV=production
   ```

3. **Build Settings**
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Node Version**: 18.x

## API Endpoints

### POST /api/generate
Transform an image into a Gigachad meme.

**Request:**
- `image`: Image file (multipart/form-data)
- `prompt`: Transformation prompt

**Response:**
- Generated image (PNG)

## Gigachad Styles
1. **OG Gigachad** 💪 - Classic meme style
2. **Mog Chad** 🔥 - Dominant presence
3. **Cartoon Gigachad** 🎨 - Comic book style
4. **Troll Gigachad** 😈 - Mischievous grin
5. **Brainrot Gigachad** 🧠 - Chaotic neon style

## License
MIT
