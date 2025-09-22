import { NextRequest, NextResponse } from 'next/server'
import FormData from 'form-data'
import axios from 'axios'

export async function POST(request: NextRequest) {
  try {
    console.log('API called - starting generation...')
    
    const formData = await request.formData()
    const image = formData.get('image') as File
    const prompt = formData.get('prompt') as string

    console.log('Received:', { hasImage: !!image, hasPrompt: !!prompt, prompt })

    if (!image || !prompt) {
      return NextResponse.json({ error: 'Missing image or prompt' }, { status: 400 })
    }

    // Convert image to buffer
    const imageBuffer = await image.arrayBuffer()
    const buffer = Buffer.from(imageBuffer)
    console.log('Image buffer size:', buffer.length)

    // Create form data exactly like the original template
    const openaiFormData = new FormData()
    openaiFormData.append('image', buffer, {
      filename: 'image.png',
      contentType: 'image/png'
    })
    openaiFormData.append('prompt', prompt)
    openaiFormData.append('size', '1024x1024')
    openaiFormData.append('n', '1')
    openaiFormData.append('model', 'gpt-image-1')

    console.log('Calling OpenAI images/edits endpoint...')
    
    // Call OpenAI images/edits endpoint directly like the original template
    const response = await axios.post('https://api.openai.com/v1/images/edits', openaiFormData, {
      headers: {
        ...openaiFormData.getHeaders(),
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      }
    })

    console.log('OpenAI response received:', !!response.data)

    const resp = response.data
    let b64 = resp?.data?.[0]?.b64_json
    const url = resp?.data?.[0]?.url

    if (!b64 && url) {
      console.log('Downloading image from URL...')
      // Fallback: download URL to buffer
      const arr = await (await fetch(url)).arrayBuffer()
      b64 = Buffer.from(arr).toString('base64')
    }

    if (!b64) {
      return NextResponse.json({ error: 'No image data from OpenAI' }, { status: 500 })
    }

    console.log('Returning image, base64 length:', b64.length)
    // Return the generated image
    const resultBuffer = Buffer.from(b64, 'base64')
    return new NextResponse(resultBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': resultBuffer.length.toString(),
      },
    })

  } catch (error) {
    console.error('Generation error:', error)
    return NextResponse.json({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
}
