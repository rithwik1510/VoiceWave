import { ArrowRight } from 'lucide-react'
import { windowsDownloadUrl } from '../config/download'

export default function Hero() {
  const heroPoints = ['Windows-first rollout', 'Local-only v1', 'Fallback-safe insertion']

  return (
    <section id="home" className="relative min-h-[96svh] pb-20 pt-4 sm:pt-8 md:min-h-[102svh] md:pb-28 md:pt-10">
      <div className="site-shell relative z-10 flex min-h-[74svh] flex-col items-center justify-center text-center text-white md:min-h-[80svh]">
        <h1 className="max-w-5xl text-balance text-[clamp(3.3rem,10vw,7rem)] leading-[0.9] text-white">
          Private Dictation.
        </h1>

        <p className="mt-5 max-w-xl text-pretty text-[clamp(0.78rem,1.9vw,1rem)] leading-relaxed text-[#d7ecff]">
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
          className="lime-cta mt-8 px-6 py-2.5"
        >
          Download Setup
          <ArrowRight className="ml-2 h-3.5 w-3.5" />
        </a>
      </div>
    </section>
  )
}
