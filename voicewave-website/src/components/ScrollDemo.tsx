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
    <section id="demo" className="px-0 py-10 sm:py-14">
      <div className="site-shell">
        <h2 className="text-[clamp(2.15rem,5.4vw,3.7rem)] leading-[1.02] text-[#0a1020]">Ship more, break less</h2>
        <p className="mt-3 max-w-3xl text-base text-[#475569] sm:text-lg">
          VoiceWave keeps your runtime surface visible from capture to insertion, with local fallback when apps block
          direct input.
        </p>

        <div className="demo-showcase panel-card mt-9 overflow-hidden">
          <div className="border-b border-[#dce7f7] bg-[linear-gradient(135deg,rgba(243,250,255,0.98),rgba(231,243,255,0.96))] px-6 py-3.5 sm:px-7">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#4c6284]">VoiceWave Desktop Demo</p>
          </div>

          <div className="demo-showcase-grid grid gap-0 md:grid-cols-[260px_1fr]">
            <aside className="border-b border-[#dce7f7] bg-[linear-gradient(180deg,#fafdff_0%,#f2f8ff_100%)] p-5 md:border-b-0 md:border-r md:p-6">
              <div className="space-y-2.5">
                {states.map((state, stateIndex) => {
                  const activeState = stateIndex === index
                  return (
                    <button
                      key={state.id}
                      type="button"
                      onClick={() => setIndex(stateIndex)}
                      className={`flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                        activeState
                          ? 'border-[#bcd3f4] bg-white/92 text-[#0f172a]'
                          : 'border-transparent bg-transparent text-[#5d7190] hover:bg-white/78'
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

            <div className="demo-showcase-main p-6 sm:p-8 md:p-10">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-[2.35rem] leading-none text-[#0a1020] sm:text-[2.7rem]">{active.title}</h3>
                  <p className="mt-2 text-sm text-[#64748b] sm:text-base">{active.hint}</p>
                </div>
                <span className="rounded-full border border-[#dbe5f1] bg-[#f8fbff] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#475569]">
                  fw-small.en
                </span>
              </div>

              <div className="mt-7 overflow-hidden rounded-2xl border border-[#cfe1f8] bg-[linear-gradient(150deg,rgba(244,250,255,0.97),rgba(226,241,255,0.93))] p-6">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#64748b]">Transcript</p>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={active.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    className="mt-2 min-h-20 text-lg text-[#23364f] sm:text-xl"
                  >
                    {active.transcript}
                  </motion.p>
                </AnimatePresence>
              </div>

              <div className="mt-6 grid gap-3.5 text-sm text-[#334155] sm:grid-cols-2">
                <div className="rounded-xl border border-[#d6e5f8] bg-[linear-gradient(160deg,#ffffff_0%,#eef6ff_100%)] px-4 py-3.5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#64748b]">Pipeline</p>
                  <p className="mt-1">{'Capture -> Decode -> Insert'}</p>
                </div>
                <div className="rounded-xl border border-[#d6e5f8] bg-[linear-gradient(160deg,#ffffff_0%,#eef6ff_100%)] px-4 py-3.5">
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
