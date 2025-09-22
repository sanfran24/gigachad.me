'use client'

import { useRef, useState, useEffect } from 'react'
import Image from 'next/image'

const GIGACHAD_PROMPTS = [
  {
    id: 'og-gigachad',
    name: 'OG Gigachad',
    prompt: 'Transform this character into the iconic "Gigachad" meme. Extreme hyper-masculine exaggeration: wide, angular jawline, sharp cheekbones, symmetrical face, deep brow ridge. Stoic neutral stare, slightly turned three-quarters angle (classic portrait style). High-contrast black-and-white, dramatic shadows defining jaw and muscles, desaturated grayscale tones. Sculpted, statue-like, as if carved from marble. Meme aesthetic of surreal perfection. Simple dark gradient background.',
    emoji: '💪'
  },
  {
    id: 'mog-chad',
    name: 'Mog Chad',
    prompt: 'Transform this character into the "Mogging Gigachad" style meme. Ultra-chiseled, masculine face with extreme jawline and cheekbones, three-quarter angle looking downward with condescending confidence. Heavy shadows emphasize exaggerated facial symmetry and dominance. Grayscale, high-contrast, surreal marble bust effect. Stoic expression showing superiority, subtle smirk. Background kept simple dark tone to highlight intensity. Exaggerated proportions to emphasize "mogging" presence.',
    emoji: '🔥'
  },
  {
    id: 'cartoon-gigachad',
    name: 'Cartoon Gigachad',
    prompt: 'Transform this character into a cartoon parody of the "Gigachad" meme. Bold black outlines, simplified yet exaggerated features: huge square jaw, angular cheekbones, perfect symmetrical smile. Three-quarter angle close-up, comic-book style shading, high contrast but with flat color fills. Slight smirk expression, overly confident pose. Cartoonish musculature if body is visible, smooth gradient background in meme aesthetic. Style should feel like a humorous caricature of the original meme.',
    emoji: '🎨'
  },
  {
    id: 'troll-gigachad',
    name: 'Troll Gigachad',
    prompt: 'Transform this character into a "Troll Gigachad" meme. Blend exaggerated Gigachad body and jawline with the trollface smirk. Wide, angular jaw but warped with mischievous grin, bulging cheekbones, exaggerated eyebrow arch. Three-quarter angle, grayscale contrast, with troll-style meme expression. Sculpted physique but absurd troll grin dominating the face. Meme parody aesthetic, humorous and surreal. Background plain or dark gradient for focus.',
    emoji: '😈'
  },
  {
    id: 'brainrot-gigachad',
    name: 'Brainrot Gigachad',
    prompt: 'Transform this character into a chaotic "Brainrot Gigachad" meme. Hyper-saturated neon colors, distorted proportions, glowing eyes, glitch effects, and exaggerated jawline. Camera angle tilted or fisheye style for absurd perspective. Ultra-masculine but warped, surreal, and noisy. Meme layering with sparkles, flames, or gaudy textures in background. Style should feel chaotic, over-stimulating, and absurdly exaggerated compared to the clean original Gigachad meme.',
    emoji: '🧠'
  }
]

export default function Home() {
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [selectedPrompt, setSelectedPrompt] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [resultImage, setResultImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [introHidden, setIntroHidden] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  // Background panning effect on scroll
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop
      const docHeight = Math.max(
        document.body.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.clientHeight,
        document.documentElement.scrollHeight,
        document.documentElement.offsetHeight
      )
      const winHeight = window.innerHeight
      const maxScroll = Math.max(docHeight - winHeight, 1)
      const progress = Math.min(Math.max(scrollTop / maxScroll, 0), 1)
      const y = (progress * 100).toFixed(2) + '%'
      
      document.body.style.backgroundPosition = 'center ' + y
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll)

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [])

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedImage(file)
      setError(null)
      setResultImage(null)
    }
  }

  const handleGenerate = async () => {
    if (!selectedImage || !selectedPrompt) {
      setError('Please select an image and a gigachad variant')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('image', selectedImage)
      formData.append('prompt', selectedPrompt)

      const response = await fetch('/api/generate', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Failed to generate image')
      }

      const blob = await response.blob()
      const imageUrl = URL.createObjectURL(blob)
      setResultImage(imageUrl)
    } catch (err) {
      setError('Failed to generate image. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main>
      {!introHidden && (
        <div className={`gc-intro`}>
          <video ref={videoRef} src="/intro.mp4" preload="auto" playsInline onEnded={() => setIntroHidden(true)} />
          <button className="gc-intro-cta" onClick={() => { const v = videoRef.current; if (!v) return; v.muted = false; v.volume = 1; v.currentTime = 0; v.play(); }}>
            GIGACHAD ME
          </button>
        </div>
      )}
      <div className="gc-container" style={{ paddingTop: 0 }}>

        {/* Bot Section - Moved below header */}
        <section className="gc-grid">
          {/* Upload Section */}
          <div className="gc-card">
            <h2>Upload Your Photo</h2>
            
            <div style={{ marginBottom: 16 }}>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="gc-file"
              />
            </div>

            {selectedImage && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ color: 'rgba(255,255,255,0.9)', marginBottom: 8 }}>Selected Image:</p>
                <Image
                  src={URL.createObjectURL(selectedImage)}
                  alt="Selected"
                  width={200}
                  height={200}
                  className="gc-preview"
                />
              </div>
            )}

            <h3 style={{ color: '#fff', marginTop: 6 }}>Choose Your Gigachad</h3>
            <div className="gc-style-grid">
              {GIGACHAD_PROMPTS.map((chad) => (
                <button
                  key={chad.id}
                  onClick={() => setSelectedPrompt(chad.prompt)}
                  className={`gc-style ${selectedPrompt === chad.prompt ? 'gc-active' : ''}`}
                >
                  <div className="gc-style-emoji">{chad.emoji}</div>
                  <div className="gc-style-name">{chad.name}</div>
                </button>
              ))}
            </div>

            <button
              onClick={handleGenerate}
              disabled={!selectedImage || !selectedPrompt || isLoading}
              className="gc-button"
            >
              {isLoading ? '🔄 Forging Your Final Form...' : '🚀 Transform My Photo!'}
            </button>

            {error && (
              <div className="gc-error" style={{ marginTop: 14 }}>{error}</div>
            )}
          </div>

          {/* Result Section */}
          <div className="gc-card">
            <h2>Your Gigachad Transformation</h2>

            {isLoading && (
              <div className="gc-loader">🔄 AI is pumping iron...</div>
            )}

            {resultImage && (
              <div style={{ textAlign: 'center' }}>
                <Image
                  src={resultImage}
                  alt="Generated meme transformation"
                  width={400}
                  height={400}
                  className="gc-result-img"
                />
                <a
                  href={resultImage}
                  download="gigachadify-result.jpg"
                  className="gc-download"
                >
                  📥 Download Result
                </a>
              </div>
            )}

            {!resultImage && !isLoading && !error && (
              <div className="gc-empty">Your transformed image will appear here</div>
            )}
          </div>
        </section>

        {/* Scattered Quotes Throughout Page */}
        <div className="gc-scattered-quotes">
          <div className="gc-quote gc-quote-1">Become the kind of person your future self thanks.</div>
          <div className="gc-quote gc-quote-2">Discipline beats motivation. Show up, no matter what.</div>
          <div className="gc-quote gc-quote-3">Comfort is a cage. Step out and grow.</div>
          <div className="gc-quote gc-quote-4">Results talk. Excuses walk.</div>
          <div className="gc-quote gc-quote-5">Grind in silence. Let success be the noise.</div>
          <div className="gc-quote gc-quote-6">One more rep. One more page. One more step.</div>
          <div className="gc-quote gc-quote-7">You're not tired. You're just untrained.</div>
          <div className="gc-quote gc-quote-8">Stay dangerous. Stay humble.</div>
          <div className="gc-quote gc-quote-9">Pressure creates diamonds. Embrace it.</div>
          <div className="gc-quote gc-quote-10">Win the morning. Win the day.</div>
          <div className="gc-quote gc-quote-11">Keep promises you make to yourself.</div>
          <div className="gc-quote gc-quote-12">Small habits. Massive outcomes.</div>
          <div className="gc-quote gc-quote-13">Suffer now. Live like a king later.</div>
          <div className="gc-quote gc-quote-14">Focus is the new superpower.</div>
          <div className="gc-quote gc-quote-15">Be so consistent it looks like magic.</div>
          <div className="gc-quote gc-quote-16">Hunger over comfort. Always.</div>
          <div className="gc-quote gc-quote-17">Your standards build your reality.</div>
          <div className="gc-quote gc-quote-18">Prove your doubt wrong.</div>
          <div className="gc-quote gc-quote-19">Choose pain of discipline over pain of regret.</div>
          <div className="gc-quote gc-quote-20">Earn your confidence daily.</div>
          <div className="gc-quote gc-quote-21">Hard choices, easy life. Easy choices, hard life.</div>
          <div className="gc-quote gc-quote-22">Train your mind harder than your body.</div>
          <div className="gc-quote gc-quote-23">Silence the inner critic with action.</div>
          <div className="gc-quote gc-quote-24">Make progress too obvious to ignore.</div>
          <div className="gc-quote gc-quote-25">Your future is counting on you.</div>
          <div className="gc-quote gc-quote-26">Delete distractions. Build momentum.</div>
          <div className="gc-quote gc-quote-27">Respect is earned, not demanded.</div>
          <div className="gc-quote gc-quote-28">Be reliable. Be relentless.</div>
          <div className="gc-quote gc-quote-29">High standards. Zero drama.</div>
          <div className="gc-quote gc-quote-30">Keep it moving. No emotional luggage.</div>
          <div className="gc-quote gc-quote-31">Own your mornings. Own your life.</div>
          <div className="gc-quote gc-quote-32">Hustle quietly, dominate loudly.</div>
          <div className="gc-quote gc-quote-33">Character is what you do when no one is watching.</div>
          <div className="gc-quote gc-quote-34">Reps make results.</div>
          <div className="gc-quote gc-quote-35">Stop negotiating with your goals.</div>
          <div className="gc-quote gc-quote-36">Get uncomfortable, get unstoppable.</div>
          <div className="gc-quote gc-quote-37">Mindset first. Skillset second.</div>
          <div className="gc-quote gc-quote-38">Dreams demand receipts.</div>
          <div className="gc-quote gc-quote-39">Work until your idols become rivals.</div>
          <div className="gc-quote gc-quote-40">Outwork your old self.</div>
          <div className="gc-quote gc-quote-41">Ruthless with habits. Kind with people.</div>
          <div className="gc-quote gc-quote-42">Stand tall. Speak less. Do more.</div>
          <div className="gc-quote gc-quote-43">Your pace is fine; just don't stop.</div>
          <div className="gc-quote gc-quote-44">Eat discipline for breakfast.</div>
          <div className="gc-quote gc-quote-45">Make effort your baseline.</div>
          <div className="gc-quote gc-quote-46">Momentum loves consistency.</div>
          <div className="gc-quote gc-quote-47">Keep going. You're closer than you think.</div>
          <div className="gc-quote gc-quote-48">Be the calm in the chaos.</div>
          <div className="gc-quote gc-quote-49">Nobody is coming. Build yourself.</div>
          <div className="gc-quote gc-quote-50">Winners do it tired.</div>
          <div className="gc-quote gc-quote-51">The mission is bigger than the mood.</div>
        </div>
      </div>
    </main>
  )
}
