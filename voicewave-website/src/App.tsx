import { useEffect } from 'react'
import Header from './components/Header'
import Hero from './components/Hero'
import WhereItWorks from './components/WhereItWorks'
import ScrollDemo from './components/ScrollDemo'
import CapabilityDeepDive from './components/CapabilityDeepDive'
import Features from './components/Features'
import TrustProof from './components/TrustProof'
import Footer from './components/Footer'

function App() {
  useEffect(() => {
    const root = document.documentElement
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const applyStaticDrift = () => {
      root.style.setProperty('--site-drift-x', '0px')
      root.style.setProperty('--site-drift-y', '0px')
      root.style.setProperty('--site-grid-shift-x', '0px')
      root.style.setProperty('--site-grid-shift-y', '0px')
    }

    if (prefersReducedMotion) {
      applyStaticDrift()
      return
    }

    let rafId: number | null = null
    let lastProgress = -1

    const commitDrift = () => {
      rafId = null
      const scrollTop = window.scrollY || window.pageYOffset || 0
      const scrollRange = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1)
      const progress = Math.min(Math.max(scrollTop / scrollRange, 0), 1)

      if (Math.abs(progress - lastProgress) < 0.002) {
        return
      }

      lastProgress = progress

      const driftX = (0.5 - progress) * 52
      const driftY = (progress - 0.5) * 72
      const gridX = (progress - 0.5) * 18
      const gridY = (0.5 - progress) * 14

      root.style.setProperty('--site-drift-x', `${driftX.toFixed(2)}px`)
      root.style.setProperty('--site-drift-y', `${driftY.toFixed(2)}px`)
      root.style.setProperty('--site-grid-shift-x', `${gridX.toFixed(2)}px`)
      root.style.setProperty('--site-grid-shift-y', `${gridY.toFixed(2)}px`)
    }

    const onScroll = () => {
      if (rafId !== null) {
        return
      }
      rafId = window.requestAnimationFrame(commitDrift)
    }

    commitDrift()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      applyStaticDrift()
    }
  }, [])

  return (
    <div className="min-h-screen w-full bg-[#FAFAFA] font-sans selection:bg-[#38BDF8]/20 selection:text-[#09090B]">
      <div className="relative z-10 flex min-h-screen w-full flex-col">
        <Header />
        <main className="relative flex-grow">
          <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
            <div className="absolute inset-0 site-atmosphere" />
            <div className="absolute inset-0 site-tonefield" />
            <div className="absolute inset-0 site-grid-canvas" />
            <div className="absolute inset-0 site-grid-softener" />
            <div className="absolute inset-0 site-vignette" />
            <div className="absolute inset-0 site-grain" />
          </div>
          <div className="relative z-10">
            <div className="hero-artwork-layer" aria-hidden />
            <Hero />
            <WhereItWorks />
            <ScrollDemo />
            <CapabilityDeepDive />
            <Features />
            <TrustProof />
          </div>
        </main>
        <Footer />
      </div>
    </div>
  )
}

export default App
