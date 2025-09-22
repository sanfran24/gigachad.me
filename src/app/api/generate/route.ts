import { NextRequest, NextResponse } from 'next/server'
import FormData from 'form-data'
import axios from 'axios'

export async function POST(request: NextRequest) {
  // Handle CORS - moved outside try block
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
  
  try {
    console.log('API called - starting generation...')
    
    const formData = await request.formData()
    const image = formData.get('image') as File
    const prompt = formData.get('prompt') as string

    console.log('Received:', { hasImage: !!image, hasPrompt: !!prompt, prompt })

    if (!image || !prompt) {
      return NextResponse.json({ error: 'Missing image or prompt' }, { status: 400, headers })
    }

    // Convert image to buffer
    const imageArrayBuffer = await image.arrayBuffer()
    const buffer = Buffer.from(imageArrayBuffer)
    console.log('Image buffer size:', buffer.length)

    // Create form data for images/edits with mask
    const openaiFormData = new FormData()
    openaiFormData.append('image', buffer, {
      filename: 'image.png',
      contentType: 'image/png'
    })
    
    // Read the white mask image
    const fs = require('fs')
    const path = require('path')
    const maskPath = path.join(process.cwd(), 'public', 'mask.png')
    const maskBuffer = fs.readFileSync(maskPath)
    
    openaiFormData.append('mask', maskBuffer, {
      filename: 'mask.png',
      contentType: 'image/png'
    })
    
    openaiFormData.append('prompt', prompt)
    openaiFormData.append('size', '1024x1024')
    openaiFormData.append('n', '1')

    console.log('Calling OpenAI images/edits endpoint...')
    
    // Call OpenAI images/edits endpoint with mask
    const response = await axios.post('https://api.openai.com/v1/images/edits', openaiFormData, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        ...openaiFormData.getHeaders()
      }
    })

    console.log('OpenAI response received:', !!response.data)

    const resp = response.data
    const b64 = resp?.data?.[0]?.b64_json

    if (!b64) {
      return NextResponse.json({ error: 'No image data from OpenAI' }, { status: 500, headers })
    }

    console.log('Returning image, base64 length:', b64.length)
    // Return the generated image
    const resultBuffer = Buffer.from(b64, 'base64')
    return new NextResponse(resultBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': resultBuffer.length.toString(),
        ...headers,
      },
    })

  } catch (error) {
    console.error('Generation error:', error)
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { 
      status: 500, 
      headers 
    })
  }
}

// Handle OPTIONS requests for CORS
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
