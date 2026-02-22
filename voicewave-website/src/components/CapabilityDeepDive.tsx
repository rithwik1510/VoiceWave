import { motion } from 'framer-motion';
import { Bot, Gauge, Server } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import VoiceWaveLogo from './VoiceWaveLogo';

const LATENCY_BAR_LEVELS = Array.from({ length: 40 }, (_, i) => {
    if (i > 15 && i < 25) {
        return `${82 + (i % 5) * 4}%`;
    }
    return `${24 + (i % 4) * 6}%`;
});

function DeepDiveD() {
    const sectionRef = useRef<HTMLElement | null>(null);
    const [activeGradientIndex, setActiveGradientIndex] = useState(0);

    useEffect(() => {
        let rafId: number | null = null;

        const commitActiveGradient = () => {
            rafId = null;
            const section = sectionRef.current;
            if (!section) {
                return;
            }

            const rect = section.getBoundingClientRect();
            const viewportHeight = window.innerHeight || 1;
            const travel = Math.max(rect.height - viewportHeight * 0.45, 1);
            const progress = Math.min(Math.max((viewportHeight * 0.26 - rect.top) / travel, 0), 1);

            const nextIndex = progress < 0.34 ? 0 : progress < 0.68 ? 1 : 2;
            setActiveGradientIndex((current) => (current === nextIndex ? current : nextIndex));
        };

        const onScrollOrResize = () => {
            if (rafId !== null) {
                return;
            }
            rafId = window.requestAnimationFrame(commitActiveGradient);
        };

        commitActiveGradient();
        window.addEventListener('scroll', onScrollOrResize, { passive: true });
        window.addEventListener('resize', onScrollOrResize, { passive: true });

        return () => {
            window.removeEventListener('scroll', onScrollOrResize);
            window.removeEventListener('resize', onScrollOrResize);
            if (rafId !== null) {
                window.cancelAnimationFrame(rafId);
            }
        };
    }, []);

    return (
        <section ref={sectionRef} id="modules" className="section-pad relative scroll-mt-28 bg-transparent text-[#09090B] lg:min-h-[175vh]">
            <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
                <div className={`modules-gradient-layer is-latency ${activeGradientIndex === 0 ? 'is-active' : ''}`} />
                <div className={`modules-gradient-layer is-models ${activeGradientIndex === 1 ? 'is-active' : ''}`} />
                <div className={`modules-gradient-layer is-privacy ${activeGradientIndex === 2 ? 'is-active' : ''}`} />
            </div>

            <div className="site-shell px-0 grid grid-cols-1 lg:grid-cols-12 gap-10 md:gap-14 relative z-10">

                {/* Left Side: Sticky Title */}
                <div className="lg:col-span-5 relative">
                    <div className="lg:sticky top-32">
                        <div className="section-title-row mb-8">
                            <span className="section-motif">
                                <VoiceWaveLogo size={9} strokeWidth={2.6} />
                            </span>
                            <span className="font-mono text-sm uppercase tracking-widest font-bold text-[#52525B]">Deep Dive Analysis</span>
                        </div>
                        <motion.h2
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-100px" }}
                            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                            className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tighter text-[#09090B] mb-6 sm:mb-8 leading-[1.05]"
                        >
                            Power <br />
                            <span className="text-[#A1A1AA]">stacked.</span>
                        </motion.h2>
                        <motion.p
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-100px" }}
                            transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                            className="text-base sm:text-xl text-[#475569] leading-relaxed font-medium max-w-sm mb-10 sm:mb-12"
                        >
                            We stripped away the cloud to deliver a predictable on-device dictation loop directly from your machine's hardware.
                        </motion.p>

                        {/* Hardware Spec callout */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            whileInView={{ opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.6, delay: 0.3 }}
                            className="hidden lg:flex flex-col gap-4"
                        >
                            <div className="bg-[#FFFFFF] border border-[#E4E4E7] p-4 vw-radius-tab shadow-sm max-w-xs">
                                <span className="block font-mono text-xs text-[#71717A] uppercase mb-1">Compute Environment</span>
                                <span className="block font-bold text-sm">Desktop app + local model runtime</span>
                            </div>
                        </motion.div>
                    </div>
                </div>

                {/* Right Side: Scroll Stacking Cards */}
                <div className="lg:col-span-7 flex flex-col gap-10 sm:gap-16 mt-8 lg:mt-0 relative pb-24 sm:pb-36 perspective-1000">

                    {/* Card 1: Latency */}
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-100px" }}
                        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                        className="lg:sticky lg:top-32 z-10 w-full bg-[#FFFFFF]/90 backdrop-blur-xl vw-radius-shell p-6 sm:p-8 lg:p-10 shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.05)] border border-[#E4E4E7] transform-gpu"
                    >
                        <div className="flex justify-between items-start mb-8 sm:mb-12">
                            <div className="w-14 h-14 sm:w-16 sm:h-16 vw-radius-tab bg-[#FAFAFA] border border-[#E4E4E7] flex items-center justify-center shadow-inner">
                                <Gauge className="w-7 h-7 sm:w-8 sm:h-8 text-[#A3E635]" />
                            </div>
                            <span className="font-mono text-xs sm:text-sm font-bold bg-[#A3E635]/10 text-[#65A30D] px-3 py-1 rounded-full">Pipeline / Local</span>
                        </div>
                        <h3 className="font-display text-3xl sm:text-4xl font-bold text-[#09090B] mb-4">Fast Release-to-Text</h3>
                        <p className="text-base sm:text-lg text-[#475569] font-medium leading-relaxed max-w-sm mb-8">
                            Capture, decode, and insertion run on-device for a tight dictation loop.
                        </p>
                        {/* Data Viz element */}
                        <div className="w-full h-16 bg-[#FAFAFA] vw-radius-tab border border-[#E4E4E7] p-2 flex items-end gap-[2px] overflow-hidden">
                            {LATENCY_BAR_LEVELS.map((height, i) => {
                                return <div key={i} className="flex-1 bg-[#D4D4D8] rounded-t-sm" style={{ height }} />;
                            })}
                            <div className="absolute right-12 bottom-[4.5rem] bg-[#09090B] text-white text-[10px] font-mono px-2 py-1 vw-radius-tab shadow-lg">LOCAL FLOW</div>
                            <div className="absolute right-12 bottom-10 w-[1px] h-8 bg-[#09090B]" />
                        </div>
                        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[#71717A]">
                            Illustrative pipeline profile (not live telemetry).
                        </p>
                    </motion.div>

                    {/* Card 2: Local Models */}
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-100px" }}
                        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                        className="lg:sticky lg:top-40 z-20 w-full bg-[#FAFAFA]/95 backdrop-blur-xl vw-radius-shell p-6 sm:p-8 lg:p-10 shadow-[0_-20px_40px_-10px_rgba(0,0,0,0.08)] border border-[#D4D4D8] transform-gpu"
                    >
                        <div className="flex justify-between items-start mb-8 sm:mb-12">
                            <div className="w-14 h-14 sm:w-16 sm:h-16 vw-radius-tab bg-[#FFFFFF] border border-[#E4E4E7] flex items-center justify-center shadow-sm">
                                <Bot className="w-7 h-7 sm:w-8 sm:h-8 text-[#38BDF8]" />
                            </div>
                            <span className="font-mono text-xs sm:text-sm font-bold bg-[#38BDF8]/10 text-[#0284C7] px-3 py-1 rounded-full">Models / Verified</span>
                        </div>
                        <h3 className="font-display text-3xl sm:text-4xl font-bold text-[#09090B] mb-4">Local Models</h3>
                        <p className="text-base sm:text-lg text-[#475569] font-medium leading-relaxed max-w-sm mb-8">
                            Local models install with verification, then run directly in the desktop runtime.
                        </p>
                        {/* Data List element */}
                        <div className="space-y-3 font-mono text-sm border-t border-[#E4E4E7] pt-6">
                            <div className="flex justify-between items-center bg-[#FFFFFF] p-3 vw-radius-tab border border-[#E4E4E7]"><span>fw-small.en</span><span className="font-bold">LOADED</span></div>
                            <div className="flex justify-between items-center bg-[#E4E4E7]/30 p-3 vw-radius-tab text-[#A1A1AA]"><span>fw-large-v3</span><span>STANDBY</span></div>
                        </div>
                    </motion.div>

                    {/* Card 3: 100% Offline */}
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-100px" }}
                        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                        className="lg:sticky lg:top-48 z-30 w-full bg-[#09090B] vw-radius-shell p-6 sm:p-8 lg:p-10 shadow-[0_-30px_60px_-10px_rgba(0,0,0,0.2)] border border-[#27272A] transform-gpu text-[#FAFAFA]"
                    >
                        <div className="flex justify-between items-start mb-8 sm:mb-12">
                            <div className="w-14 h-14 sm:w-16 sm:h-16 vw-radius-tab bg-[#18181B] border border-[#27272A] flex items-center justify-center shadow-inner">
                                <Server className="w-7 h-7 sm:w-8 sm:h-8 text-[#FAFAFA]" />
                            </div>
                            <span className="font-mono text-xs sm:text-sm font-bold bg-[#18181B] border border-[#3F3F46] text-[#A1A1AA] px-3 py-1 rounded-full">Privacy / Local-Only</span>
                        </div>
                        <h3 className="font-display text-3xl sm:text-4xl font-bold text-[#FFFFFF] mb-4">No Cloud Transcription</h3>
                        <p className="text-base sm:text-lg text-[#A1A1AA] font-medium leading-relaxed max-w-sm mb-10 sm:mb-12">
                            Voice stays on-device in v1. Optional diagnostics export is user-triggered.
                        </p>

                        {/* Secure Terminal aesthetic */}
                        <div className="bg-[#18181B] vw-radius-tab p-4 font-mono text-xs text-[#FAFAFA] border border-[#27272A] shadow-inner relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1 h-full bg-[#A3E635]" />
                            <p className="opacity-50 mb-1">&gt; Cloud transcription path: disabled</p>
                            <p className="opacity-50 mb-1">&gt; Audio export: none by default</p>
                            <p className="text-[#A3E635] mt-2">&gt; STATUS: LOCAL MODE</p>
                        </div>
                    </motion.div>

                </div>
            </div>
        </section>
    );
}

export default function CapabilityDeepDive() {
    return <DeepDiveD />;
}
