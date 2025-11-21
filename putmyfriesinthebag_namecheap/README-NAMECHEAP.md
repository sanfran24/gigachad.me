# Put My Fries In The Bag Meme Generator - Namecheap Deployment

## Instructions

This is a static HTML version for Namecheap hosting that connects to the Render server backend.

### Setup Steps:

1. **Upload all files** in this folder to your Namecheap hosting (putmyfriesinthebag.xyz)
2. **Domain Setup:**
   - Upload these files to Namecheap hosting for `putmyfriesinthebag.xyz`
   - The static HTML will automatically call your Render backend at `https://gigachad-mess.onrender.com`
   - No DNS changes needed - this is a static frontend that calls the Render API

### Backend Connection:

The HTML is configured to call your Render server:
- **Render URL:** `https://gigachad-mess.onrender.com`
- **Endpoints:** `/transform` and `/result/:imageId`

If you need to change the backend URL, edit `index.html` and update the `API_BASE_URL` constant:

```javascript
const API_BASE_URL = 'https://gigachad-mess.onrender.com';
```

### Files Included:
- `index.html` - Main application file
- `README-NAMECHEAP.md` - This file

### Notes:
- The application requires the Render server backend to be running
- Make sure your Render server has the correct environment variables set (OPENAI_API_KEY)
- The domain must be properly configured for CORS to work

