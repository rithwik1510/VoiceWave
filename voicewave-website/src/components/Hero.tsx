import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Mic } from 'lucide-react';
import { useCallback, useRef, type PointerEvent } from 'react';
import { windowsDownloadUrl } from '../config/download';
import VoiceWaveLogo from './VoiceWaveLogo';

const HERO_METER_BARS = Array.from({ length: 24 }, (_, i) => ({
    delayMs: i * 58,
    durationMs: 1450 + (i % 6) * 120
}));

function HeroVariantD() {
    const prefersReducedMotion = useReducedMotion();
    const ctaRef = useRef<HTMLAnchorElement | null>(null);

    const handleCtaPointerMove = useCallback((event: PointerEvent<HTMLAnchorElement>) => {
        const target = ctaRef.current;
        if (!target) {
            return;
        }
        const rect = target.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 100;
        const y = ((event.clientY - rect.top) / rect.height) * 100;
        target.style.setProperty('--cta-x', `${x.toFixed(2)}%`);
        target.style.setProperty('--cta-y', `${y.toFixed(2)}%`);
    }, []);

    const handleCtaPointerLeave = useCallback(() => {
        const target = ctaRef.current;
        if (!target) {
            return;
        }
        target.style.setProperty('--cta-x', '50%');
        target.style.setProperty('--cta-y', '50%');
    }, []);

    return (
        <section id="home" className="relative scroll-mt-24 px-0 bg-transparent min-h-[calc(100svh-4.75rem)] md:min-h-[calc(100svh-5rem)] flex flex-col justify-center [padding-top:clamp(0.8rem,1.6vw,1.5rem)] [padding-bottom:clamp(0.8rem,1.6vw,1.5rem)] overflow-hidden">

            <div className="site-shell w-full relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-11 lg:gap-9 items-center">

                {/* Left Content Area (7 columns) */}
                <div className="lg:col-span-7 flex flex-col items-start relative">

                    {/* Subtle Top UI Badge to fill space */}
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                        className="hero-trust-badge mb-6 inline-flex items-center gap-2.5 bg-[#FFFFFF]/88 border border-[#E4E4E7] rounded-full px-3 py-1.5 shadow-[0_8px_20px_-16px_rgba(9,9,11,0.35)] sm:mb-8 sm:px-4 sm:py-2"
                    >
                        <span className="section-motif">
                            <VoiceWaveLogo size={9} strokeWidth={2.5} />
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#71717A] font-bold sm:text-xs sm:tracking-widest">
                            <span className="sm:hidden">Local-Only Runtime</span>
                            <span className="hidden sm:inline">Local-Only Runtime <span className="text-[#D4D4D8] mx-2">|</span> Low-Latency Dictation</span>
                        </span>
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                        className="font-display text-[clamp(2.85rem,16.5vw,4.2rem)] sm:text-6xl md:text-7xl lg:text-[8rem] font-bold tracking-tighter text-[#09090B] leading-[0.86] uppercase mb-6 sm:mb-8"
                    >
                        Private <br />
                        <span className="hero-headline-accent tracking-tighter">Dictation.</span>
                    </motion.h1>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className="max-w-[38rem] relative"
                    >
                        <p className="text-lg text-[#475569] font-medium leading-relaxed mb-7 sm:text-xl sm:mb-8">
                            Built for fast on-device dictation with no cloud transcription path in v1. Everything stays <strong className="hero-highlight-chip text-[#09090B] selection:bg-transparent">local on your computer.</strong>
                        </p>

                        <div className="mb-7 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#64748B] sm:mb-8 sm:gap-x-5">
                            <span className="inline-flex items-center gap-2">
                                <span className="h-1 w-1 rounded-full bg-[#94A3B8]/65" />
                                Windows-first rollout
                            </span>
                            <span className="inline-flex items-center gap-2">
                                <span className="h-1 w-1 rounded-full bg-[#94A3B8]/65" />
                                Local-only v1
                            </span>
                            <span className="inline-flex items-center gap-2">
                                <span className="h-1 w-1 rounded-full bg-[#94A3B8]/65" />
                                Fallback-safe insertion
                            </span>
                        </div>

                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-5 sm:gap-7">
                            <a
                                ref={ctaRef}
                                href={windowsDownloadUrl}
                                target="_blank"
                                rel="noreferrer"
                                onPointerMove={handleCtaPointerMove}
                                onPointerLeave={handleCtaPointerLeave}
                                className="hero-cta group flex w-full items-center justify-center gap-4 px-6 py-4 vw-radius-tab text-white sm:w-auto"
                            >
                                <span className="font-bold text-sm uppercase tracking-wider">Download Setup</span>
                                <ArrowRight strokeWidth={2.8} className="h-7 w-7 shrink-0 group-hover:translate-x-1 transition-transform" />
                            </a>

                            <div className="flex flex-col">
                                <span className="font-mono text-xs text-[#71717A] uppercase mb-1 drop-shadow-sm">Availability</span>
                                <span className="font-mono text-sm text-[#09090B] font-bold">Windows version is available now.</span>
                            </div>
                        </div>
                    </motion.div>
                </div>

                {/* Right UI Overlay (5 columns) */}
                <div className="lg:col-span-5 relative w-full mt-6 lg:mt-0 perspective-1000 hidden md:block">
                    <motion.div
                        className="hero-demo-glow absolute inset-[-10%] z-0"
                        animate={prefersReducedMotion ? undefined : { opacity: [0.5, 0.64, 0.5] }}
                        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <motion.div
                        initial={{ opacity: 0, y: 24 }}
                        animate={prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 1, y: [0, -4, 0] }}
                        transition={{
                            duration: 1.2,
                            delay: 0.4,
                            ease: [0.16, 1, 0.3, 1],
                            y: { duration: 9, repeat: Infinity, ease: "easeInOut", delay: 1.6 }
                        }}
                        className="z-10 w-full border border-[#E4E4E7] bg-[linear-gradient(162deg,rgba(255,255,255,0.94)_0%,rgba(250,251,252,0.88)_58%,rgba(247,251,245,0.82)_100%)] backdrop-blur-2xl vw-radius-shell shadow-[0_32px_128px_rgba(0,0,0,0.08)] overflow-hidden flex flex-col relative transform-gpu"
                    >
                        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(170px_110px_at_18%_10%,rgba(56,189,248,0.14),transparent_72%),radial-gradient(190px_130px_at_86%_90%,rgba(163,230,53,0.12),transparent_72%)] opacity-65" />
                        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-75" />

                        {/* Fake Window Header */}
                        <div className="relative z-10 h-10 border-b border-[#E4E4E7] flex items-center px-4 bg-[#FAFAFA]/82">
                            <div className="flex gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-[#D4D4D8]" />
                                <div className="w-2.5 h-2.5 rounded-full bg-[#D4D4D8]" />
                                <div className="w-2.5 h-2.5 rounded-full bg-[#D4D4D8]" />
                            </div>
                            <span className="ml-auto font-mono text-[10px] uppercase text-[#71717A] tracking-widest">Inference_Engine_UI</span>
                        </div>

                        {/* Interactive-looking Body */}
                        <div className="relative z-10 p-8">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-[#38BDF8] mix-blend-multiply opacity-12 rounded-full blur-3xl -z-10" />

                            <div className="flex items-center gap-4 mb-8">
                                <div className="w-12 h-12 vw-radius-tab bg-[#09090B] flex items-center justify-center shadow-inner">
                                    <Mic className="w-5 h-5 text-[#A3E635]" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-[#09090B] font-display text-lg">Active Listening</h3>
                                    <p className="font-mono text-xs text-[#71717A]">On-device capture + decode</p>
                                </div>
                            </div>

                            <div className="space-y-4 mb-8">
                                <div className="flex justify-between items-center text-sm border-b border-[#F4F4F5] pb-2">
                                    <span className="text-[#71717A] font-mono">Model Selection</span>
                                    <span className="font-bold text-[#09090B] bg-[#F4F4F5] px-2 py-1 vw-radius-tab">fw-small.en</span>
                                </div>
                                <div className="flex justify-between items-center text-sm border-b border-[#F4F4F5] pb-2">
                                    <span className="text-[#71717A] font-mono">Compute Base</span>
                                    <span className="font-bold text-[#09090B]">CPU default / GPU optional</span>
                                </div>
                                <div className="flex justify-between items-center text-sm border-b border-[#F4F4F5] pb-2">
                                    <span className="text-[#71717A] font-mono">Runtime Profile</span>
                                    <span className="font-bold text-[#38BDF8]">Hardware-aware</span>
                                </div>
                            </div>

                            {/* Audio visualizer simulation */}
                            <div className="hero-meter h-16 mt-auto">
                                {HERO_METER_BARS.map((bar, i) => (
                                    <div
                                        key={i}
                                        className="hero-meter-bar"
                                        style={
                                            prefersReducedMotion
                                                ? undefined
                                                : {
                                                    animationDelay: `${bar.delayMs}ms`,
                                                    animationDuration: `${bar.durationMs}ms`
                                                }
                                        }
                                    />
                                ))}
                            </div>
                        </div>
                    </motion.div>

                    {/* Faint side technical watermark text */}
                    <div className="absolute -right-8 top-1/2 -translate-y-1/2 rotate-90 origin-top-right text-[10px] font-mono uppercase tracking-[0.2em] text-[#D4D4D8] whitespace-nowrap pointer-events-none hidden xl:block">
                        Build_Ref // Architecture_x86_64_ARM64
                    </div>
                </div>

            </div>
        </section>
    );
}

export default function Hero() {
    return <HeroVariantD />;
}
