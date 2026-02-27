import { useEffect, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { windowsDownloadUrl } from '../config/download'
import HeroDottedField, { type HeroSafeZone } from './HeroDottedField'

export default function Hero() {
  const heroPoints = ['Windows-first rollout', 'Local-only v1', 'Fallback-safe insertion']
  const heroSectionRef = useRef<HTMLElement | null>(null)
  const copyStackRef = useRef<HTMLDivElement | null>(null)
  const [safeZone, setSafeZone] = useState<HeroSafeZone | null>(null)
  const [topCutoffPx, setTopCutoffPx] = useState(0)

  useEffect(() => {
    const heroSection = heroSectionRef.current
    const copyStack = copyStackRef.current

    if (!heroSection || !copyStack) {
      return
    }

    const header = heroSection.parentElement?.querySelector('header')
    let frameId = 0

    const computeLayout = () => {
      frameId = 0
      const heroRect = heroSection.getBoundingClientRect()
      const copyRect = copyStack.getBoundingClientRect()
      if (heroRect.width <= 0 || heroRect.height <= 0) {
        return
      }

      const centerX = copyRect.left - heroRect.left + copyRect.width * 0.5
      const centerY = copyRect.top - heroRect.top + copyRect.height * 0.5
      const radiusFromWidth = copyRect.width * 0.34
      const radiusFromHeight = copyRect.height * 0.62
      const unclampedRadius = Math.max(radiusFromWidth, radiusFromHeight) + 8
      const radius = Math.min(unclampedRadius, heroRect.width * 0.24)

      const nextSafeZone: HeroSafeZone = {
        centerX,
        centerY,
        radius
      }

      setSafeZone((previous) => {
        const previousRadius = previous?.radius ?? 0
        const nextRadius = nextSafeZone.radius ?? 0

        if (
          previous &&
          Math.abs(previous.centerX - nextSafeZone.centerX) < 0.5 &&
          Math.abs(previous.centerY - nextSafeZone.centerY) < 0.5 &&
          Math.abs(previousRadius - nextRadius) < 0.5
        ) {
          return previous
        }
        return nextSafeZone
      })

      const navBottom = header?.getBoundingClientRect().bottom ?? heroRect.top
      const cutoff = Math.max(0, navBottom - heroRect.top + 2)
      setTopCutoffPx((previous) => (Math.abs(previous - cutoff) < 0.5 ? previous : cutoff))
    }

    const scheduleCompute = () => {
      if (frameId !== 0) {
        return
      }
      frameId = window.requestAnimationFrame(computeLayout)
    }

    scheduleCompute()

    const resizeObserver = new ResizeObserver(() => {
      scheduleCompute()
    })

    resizeObserver.observe(heroSection)
    resizeObserver.observe(copyStack)
    if (header instanceof HTMLElement) {
      resizeObserver.observe(header)
    }

    window.addEventListener('resize', scheduleCompute, { passive: true })

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId)
      }
      resizeObserver.disconnect()
      window.removeEventListener('resize', scheduleCompute)
    }
  }, [])

  return (
    <section
      id="home"
      ref={heroSectionRef}
      className="relative min-h-[96svh] overflow-hidden pb-20 pt-4 sm:pt-8 md:min-h-[102svh] md:pb-28 md:pt-10"
    >
      <div className="zone-hero-dotted-layer">
        <HeroDottedField theme="dark" safeZone={safeZone ?? undefined} topCutoffPx={topCutoffPx} />
      </div>

      <div className="site-shell relative z-10 flex min-h-[74svh] flex-col items-center justify-center text-center text-white md:min-h-[80svh]">
        <div ref={copyStackRef} className="hero-copy-stack">
          <h1 className="hero-title-copy max-w-5xl text-balance text-[clamp(3.3rem,10vw,7rem)] leading-[0.9] text-white">
            Private Dictation.
          </h1>

          <p className="hero-body-copy mt-5 max-w-xl text-pretty text-[clamp(0.78rem,1.9vw,1rem)] leading-relaxed text-[#d7ecff]">
            Built for fast on-device dictation with no cloud transcription path in v1. Everything stays local on your
            computer.
          </p>

          <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-[#dff0ff] sm:text-[9px]">
            {heroPoints.map((point) => (
              <li key={point} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-1 w-1 rounded-full bg-[#7ed8ff]" />
                {point}
              </li>
            ))}
          </ul>

          <a
            href={windowsDownloadUrl}
            target="_blank"
            rel="noreferrer"
            download
            className="lime-cta pointer-events-auto mt-8 px-6 py-2.5"
          >
            Download Setup
            <ArrowRight className="ml-2 h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </section>
  )
}

