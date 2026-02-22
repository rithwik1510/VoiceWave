import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  CheckCircle2,
  Bell,
  BookText,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  Cpu,
  Home,
  Mic,
  Radio,
  Power,
  ScanText,
  User
} from 'lucide-react'
import { useEffect, useState } from 'react'
import VoiceWaveLogo from './VoiceWaveLogo'

type DemoState = {
  id: 'idle' | 'listening' | 'transcribing' | 'inserted' | 'error'
  label: string
  cardTitle: string
  hint: string
  transcript: string
  modeTag: string
}

const DEMO_STATES: DemoState[] = [
  {
    id: 'idle',
    label: 'Idle',
    cardTitle: 'Ready',
    hint: 'Press and hold to talk.',
    transcript: 'Waiting for input.',
    modeTag: 'ARMED'
  },
  {
    id: 'listening',
    label: 'Live',
    cardTitle: 'Listening...',
    hint: 'Release to transcribe.',
    transcript: 'So today we are finalizing the release notes',
    modeTag: 'LIVE'
  },
  {
    id: 'transcribing',
    label: 'Transcribing',
    cardTitle: 'Transcribing...',
    hint: 'Local decode in progress.',
    transcript: 'So today we are finalizing the release notes and launch checklist',
    modeTag: 'DECODING'
  },
  {
    id: 'inserted',
    label: 'Inserted',
    cardTitle: 'Inserted',
    hint: 'Text delivered to active app.',
    transcript: 'So today we are finalizing the release notes and launch checklist.',
    modeTag: 'INSERTED'
  },
  {
    id: 'error',
    label: 'Error',
    cardTitle: 'Recovered',
    hint: 'Saved to history + clipboard.',
    transcript: '[fallback] transcript preserved locally',
    modeTag: 'FALLBACK'
  }
]

const LOOP_INTERVAL_MS = 2200

export default function ScrollDemo() {
  const prefersReducedMotion = useReducedMotion()
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (prefersReducedMotion) {
      return
    }

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % DEMO_STATES.length)
    }, LOOP_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }, [prefersReducedMotion])

  const active = DEMO_STATES[activeIndex]
  const isAlert = active.id === 'error'
  const isDone = active.id === 'inserted'

  return (
    <section id="demo" className="section-pad-tight relative overflow-hidden scroll-mt-28 bg-transparent px-0">
      <div className="relative z-10 site-shell">
        <div className="section-title-row">
          <span className="section-motif">
            <VoiceWaveLogo size={9} strokeWidth={2.6} />
          </span>
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#52525B]">Live Demo Loop</span>
        </div>
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[#71717A]">
          Interactive simulation for product flow preview.
        </p>

        <div className="mx-auto mt-6 grid max-w-[1240px] items-start gap-5 lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-8">
          <aside className="lg:sticky lg:top-28 lg:h-[calc(100vh-9rem)]">
            <div className="relative flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden lg:h-full lg:flex-col lg:justify-between lg:py-1 lg:pl-1">
              <span className="pointer-events-none absolute left-[24px] top-4 bottom-4 hidden w-px bg-[#D9F99D] lg:block" />
              {DEMO_STATES.map((state, index) => (
                <button
                  key={`state-rail-${state.id}`}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`relative z-10 flex w-[9.4rem] shrink-0 items-center gap-2.5 vw-radius-tab border px-3 py-2.5 text-left font-mono text-[10px] uppercase tracking-[0.12em] backdrop-blur-sm transition-all duration-250 lg:w-full lg:gap-3 lg:py-3 lg:text-[11px] lg:tracking-[0.14em] ${
                    index === activeIndex
                      ? 'border-[#0F172A]/38 bg-[linear-gradient(152deg,rgba(255,255,255,0.88),rgba(236,252,203,0.72))] text-[#0F172A] shadow-[0_14px_28px_-20px_rgba(15,23,42,0.42)]'
                      : 'border-[#E4E4E7]/85 bg-[linear-gradient(152deg,rgba(255,255,255,0.66),rgba(248,250,252,0.58))] text-[#71717A] hover:border-[#94A3B8] hover:text-[#334155] hover:bg-[linear-gradient(152deg,rgba(255,255,255,0.76),rgba(241,245,249,0.64))]'
                  }`}
                >
                  <span
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
                      index === activeIndex
                        ? 'border-[#0F172A]/28 bg-[linear-gradient(152deg,rgba(255,255,255,0.92),rgba(248,250,252,0.78))] text-[#09090B] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]'
                        : 'border-[#E4E4E7]/80 bg-[linear-gradient(152deg,rgba(255,255,255,0.74),rgba(248,250,252,0.62))] text-[#64748B]'
                    }`}
                  >
                    {state.id === 'idle' && <Power size={16} />}
                    {state.id === 'listening' && <Radio size={16} />}
                    {state.id === 'transcribing' && <ScanText size={16} />}
                    {state.id === 'inserted' && <CheckCircle2 size={16} />}
                    {state.id === 'error' && <CircleAlert size={16} />}
                  </span>
                  {state.label}
                </button>
              ))}
            </div>
          </aside>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-120px' }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-[1100px] overflow-hidden vw-radius-shell border border-[#D4D4D8] bg-[#FFFFFF] shadow-[0_26px_70px_-48px_rgba(9,9,11,0.38)]"
          >
          <div className="flex items-center justify-between border-b border-[#E4E4E7] bg-[#FAFAFA] px-4 py-2.5 sm:px-5 sm:py-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#D4D4D8]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#D4D4D8]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#D4D4D8]" />
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#71717A]">VoiceWave Desktop</span>
          </div>

          <div className="md:grid md:grid-cols-[214px_1fr]">
            <aside className="hidden border-b border-[#E4E4E7] bg-[#F4F4F5]/80 p-4 md:block md:border-b-0 md:border-r">
              <div className="flex items-center gap-2 px-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#09090B] text-white">
                  <VoiceWaveLogo size={13} strokeWidth={2.4} />
                </span>
                <div>
                  <p className="font-display text-xl leading-none text-[#09090B]">VoiceWave</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#71717A]">Product preview</p>
                </div>
              </div>

              <nav className="mt-6 space-y-2">
                <div className="flex items-center gap-3 vw-radius-tab border border-[#0F172A]/50 bg-white px-3 py-2 text-sm font-semibold text-[#09090B] shadow-[0_8px_20px_-20px_rgba(15,23,42,0.6)]">
                  <Home size={15} className="text-[#09090B]" />
                  Home
                </div>
                <div className="group flex items-center gap-3 vw-radius-tab border border-transparent px-3 py-2 text-sm text-[#52525B]">
                  <Clock3 size={15} className="text-[#64748B] group-hover:text-[#0F172A] transition-colors" />
                  Sessions
                </div>
                <div className="group flex items-center gap-3 vw-radius-tab border border-transparent px-3 py-2 text-sm text-[#52525B]">
                  <Cpu size={15} className="text-[#64748B] group-hover:text-[#0F172A] transition-colors" />
                  Models
                </div>
                <div className="group flex items-center gap-3 vw-radius-tab border border-transparent px-3 py-2 text-sm text-[#52525B]">
                  <BookText size={15} className="text-[#64748B] group-hover:text-[#0F172A] transition-colors" />
                  Dictionary
                </div>
              </nav>

              <div className="mt-5 vw-radius-panel border border-[#D4D4D8] bg-white p-3">
                <p className="inline-flex items-center gap-1 rounded-full border border-[#A3E635]/40 bg-[#ECFCCB] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#3F3F46]">
                  Plan: Free
                </p>
                <p className="mt-2 text-xs text-[#52525B]">Local dictation enabled.</p>
              </div>
            </aside>

            <div className="p-4 sm:p-5 md:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-display text-3xl leading-none tracking-tight text-[#09090B] sm:text-4xl md:text-5xl">Ready for dictation.</h3>
                  <p className="mt-2 text-sm text-[#64748B] md:text-base">Local runtime is active on this demo screen.</p>
                </div>
                <div className="strip-edge-mask hidden items-center gap-4 vw-radius-panel border border-[#E4E4E7] bg-[#FAFAFA] px-4 py-2 text-sm md:flex">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#94A3B8]">Streak</p>
                    <p className="font-semibold text-[#09090B]">12</p>
                  </div>
                  <div className="h-8 w-px bg-[#E4E4E7]" />
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#94A3B8]">Today</p>
                    <p className="font-semibold text-[#09090B]">2.4k</p>
                  </div>
                  <div className="h-8 w-px bg-[#E4E4E7]" />
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#94A3B8]">Pipeline</p>
                    <p className="font-semibold text-[#0F766E]">Demo</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-3 xl:grid-cols-[1fr_278px]">
                <article
                  className={`relative overflow-hidden vw-radius-shell border bg-[#F8FAFC] p-5 md:p-6 ${
                    isAlert
                      ? 'border-[#475569]/70'
                      : isDone
                        ? 'border-[#A3E635]/70'
                        : 'border-[#0F172A]/48'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-display text-3xl tracking-tight text-[#09090B] sm:text-4xl">{active.cardTitle}</p>
                      <p className="mt-1 text-base text-[#64748B]">{active.hint}</p>
                      <p className="mt-3 font-mono text-xs uppercase tracking-[0.14em] text-[#71717A]">Model: fw-small.en</p>
                    </div>
                    <motion.span
                      className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-[#111827] text-white shadow-[0_14px_24px_-16px_rgba(15,23,42,0.9)] sm:h-24 sm:w-24"
                      animate={
                        active.id === 'listening'
                          ? {
                              scale: [1, 1.08, 1],
                              boxShadow: ['0 0 0 0 rgba(56,189,248,0.0)', '0 0 0 10px rgba(56,189,248,0.24)', '0 0 0 0 rgba(56,189,248,0.0)']
                            }
                          : { scale: 1 }
                      }
                      transition={{ duration: 1.2, repeat: active.id === 'listening' ? Infinity : 0 }}
                    >
                      <Mic size={28} />
                    </motion.span>
                  </div>
                  <div className="demo-audio-track mt-4">
                    <div
                      className={`demo-audio-accent ${
                        active.id === 'listening' || active.id === 'transcribing' ? 'is-live' : ''
                      } ${isDone ? 'is-done' : ''} ${isAlert ? 'is-alert' : ''}`}
                    />
                  </div>
                </article>

                <div className="space-y-3">
                  <article className="vw-radius-panel border border-[#0F172A]/35 bg-[#FAFAFA] px-4 py-3">
                    <p className="font-display text-[28px] leading-none text-[#09090B] sm:text-[34px]">Model</p>
                    <p className="mt-1 font-mono text-xs uppercase tracking-[0.14em] text-[#71717A]">fw-small.en</p>
                  </article>
                  <article className="vw-radius-panel border border-[#A3E635]/70 bg-[#FAFAFA] px-4 py-3">
                    <div className="flex items-center justify-between">
                      <p className="font-display text-[28px] leading-none text-[#09090B] sm:text-[34px]">Mode</p>
                      <span className="rounded-full border border-[#A3E635]/55 bg-[#ECFCCB] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[#3F3F46]">
                        Auto
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-xs uppercase tracking-[0.14em] text-[#71717A]">push to talk</p>
                  </article>
                </div>
              </div>

              <article className="mt-4 vw-radius-panel border border-[#E4E4E7] bg-[#FFFFFF] px-5 py-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#71717A]">Transcript</p>
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#E4E4E7] bg-[#F8FAFC] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#52525B]">
                    {isAlert ? <CircleAlert size={11} /> : isDone ? <ClipboardCheck size={11} /> : <Mic size={11} />}
                    {active.modeTag}
                  </span>
                </div>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={`${active.id}-transcript`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25 }}
                    className="mt-2 min-h-[30px] text-base text-[#3F3F46] sm:text-lg"
                  >
                    {active.transcript}
                  </motion.p>
                </AnimatePresence>
              </article>

              <div className="mt-4 overflow-hidden vw-radius-panel border border-[#E4E4E7] bg-[#FAFAFA]">
                <div className="grid grid-cols-[86px_1fr] border-b border-[#E4E4E7] px-4 py-3 text-xs sm:grid-cols-[110px_1fr] sm:text-sm">
                  <p className="text-[#71717A]">7:13 PM</p>
                  <p className="text-[#3F3F46]">Ship the Windows validation summary by 5 PM.</p>
                </div>
                <div className="grid grid-cols-[86px_1fr] px-4 py-3 text-xs sm:grid-cols-[110px_1fr] sm:text-sm">
                  <p className="text-[#71717A]">Today</p>
                  <p className="text-[#3F3F46]">Draft the release checklist and confirm model install status.</p>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end">
                <div className="hidden items-center gap-3 text-[#71717A] md:flex">
                  <Bell size={15} />
                  <User size={15} />
                  <span className="font-medium text-[#3F3F46]">Workspace</span>
                </div>
              </div>
            </div>
          </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
