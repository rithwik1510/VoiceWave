import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { CheckCircle2, CircleAlert, Mic, Radio, ScanText } from 'lucide-react'
import { useEffect, useState } from 'react'

type DemoState = {
  id: 'idle' | 'listening' | 'transcribing' | 'inserted' | 'error'
  title: string
  hint: string
  transcript: string
}

const states: DemoState[] = [
  {
    id: 'idle',
    title: 'Ready',
    hint: 'Press and hold to talk',
    transcript: 'Waiting for input.'
  },
  {
    id: 'listening',
    title: 'Listening',
    hint: 'Capture running locally',
    transcript: 'So today we are finalizing the release notes'
  },
  {
    id: 'transcribing',
    title: 'Transcribing',
    hint: 'Local decode in progress',
    transcript: 'So today we are finalizing the release notes and launch checklist'
  },
  {
    id: 'inserted',
    title: 'Inserted',
    hint: 'Text delivered to focused app',
    transcript: 'So today we are finalizing the release notes and launch checklist.'
  },
  {
    id: 'error',
    title: 'Recovered',
    hint: 'Fallback preserved transcript',
    transcript: '[fallback] transcript preserved in history + clipboard'
  }
]

export default function ScrollDemo() {
  const prefersReducedMotion = useReducedMotion()
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (prefersReducedMotion) {
      return
    }

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % states.length)
    }, 2200)

    return () => window.clearInterval(timer)
  }, [prefersReducedMotion])

  const active = states[index]

  return (
    <section id="demo" className="px-0 py-8 sm:py-10">
      <div className="site-shell-tight">
        <h2 className="text-[clamp(2rem,5vw,3.25rem)] leading-[1.02] text-[#0a1020]">Ship more, break less</h2>
        <p className="mt-3 max-w-2xl text-sm text-[#475569] sm:text-base">
          VoiceWave keeps your runtime surface visible from capture to insertion, with local fallback when apps block
          direct input.
        </p>

        <div className="panel-card mt-7 overflow-hidden">
          <div className="border-b border-[#e8edf4] bg-[#f8fbff] px-5 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#64748b]">VoiceWave Desktop Demo</p>
          </div>

          <div className="grid gap-0 md:grid-cols-[220px_1fr]">
            <aside className="border-b border-[#eef2f7] bg-[#fbfdff] p-4 md:border-b-0 md:border-r md:p-5">
              <div className="space-y-2">
                {states.map((state, stateIndex) => {
                  const activeState = stateIndex === index
                  return (
                    <button
                      key={state.id}
                      type="button"
                      onClick={() => setIndex(stateIndex)}
                      className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                        activeState
                          ? 'border-[#c9d8eb] bg-white text-[#0f172a]'
                          : 'border-transparent bg-transparent text-[#64748b] hover:bg-white'
                      }`}
                    >
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#dbe4f0] bg-white">
                        {state.id === 'idle' && <Mic size={14} />}
                        {state.id === 'listening' && <Radio size={14} />}
                        {state.id === 'transcribing' && <ScanText size={14} />}
                        {state.id === 'inserted' && <CheckCircle2 size={14} />}
                        {state.id === 'error' && <CircleAlert size={14} />}
                      </span>
                      {state.title}
                    </button>
                  )
                })}
              </div>
            </aside>

            <div className="p-5 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-3xl leading-none text-[#0a1020] sm:text-4xl">{active.title}</h3>
                  <p className="mt-2 text-sm text-[#64748b] sm:text-base">{active.hint}</p>
                </div>
                <span className="rounded-full border border-[#dbe5f1] bg-[#f8fbff] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#475569]">
                  fw-small.en
                </span>
              </div>

              <div className="mt-6 overflow-hidden rounded-2xl border border-[#d9e4f3] bg-[#f4f8ff] p-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#64748b]">Transcript</p>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={active.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    className="mt-2 min-h-14 text-base text-[#334155] sm:text-lg"
                  >
                    {active.transcript}
                  </motion.p>
                </AnimatePresence>
              </div>

              <div className="mt-5 grid gap-3 text-sm text-[#334155] sm:grid-cols-2">
                <div className="rounded-xl border border-[#e2e8f0] bg-white px-4 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#64748b]">Pipeline</p>
                  <p className="mt-1">{'Capture -> Decode -> Insert'}</p>
                </div>
                <div className="rounded-xl border border-[#e2e8f0] bg-white px-4 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#64748b]">Mode</p>
                  <p className="mt-1">Local-only v1 with fallback-safe insertion</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
