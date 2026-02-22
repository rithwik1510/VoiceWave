import { motion } from 'framer-motion';
import { Zap, ShieldCheck, DownloadCloud, ClipboardCopy } from 'lucide-react';
import VoiceWaveLogo from './VoiceWaveLogo';

const features = [
    {
        icon: <Zap className="w-6 h-6" />,
        title: 'Low-Latency Local Pipeline',
        description: 'Capture, decode, and insertion run on-device. VoiceWave targets fast release-to-text flow on supported hardware.',
        spec: 'On-device decode + deterministic state flow'
    },
    {
        icon: <ShieldCheck className="w-6 h-6" />,
        title: 'Privacy-First by Default',
        description: 'v1 keeps audio local. No cloud transcription path and no raw-audio telemetry export.',
        spec: 'No outbound audio in v1'
    },
    {
        icon: <DownloadCloud className="w-6 h-6" />,
        title: 'Verified Model Control',
        description: 'Install and switch local models with checksum verification and hardware-aware recommendations.',
        spec: 'Checksum-verified model installs'
    },
    {
        icon: <ClipboardCopy className="w-6 h-6" />,
        title: 'Reliable Insertion Chain',
        description: 'Insertion prefers direct paste, then clipboard and history fallback so text is preserved when an app blocks direct input.',
        spec: 'Direct -> clipboard -> history fallback'
    }
];

function FeaturesD() {
    return (
        <section id="features" className="section-pad-tight relative scroll-mt-28 overflow-hidden bg-transparent px-0">
            {/* Faint side technical watermark text */}
            <div className="absolute left-4 top-1/2 -translate-y-1/2 -rotate-90 origin-top-left text-[10px] font-mono uppercase tracking-[0.2em] text-[#D4D4D8] whitespace-nowrap pointer-events-none hidden xl:block z-0">
                System_Architecture_Overview // LOCAL_RUNTIME
            </div>

            <div className="site-shell-tight flex flex-col items-start gap-10 md:gap-14 relative z-10">

                <div className="max-w-2xl relative">
                    <div className="section-title-row mb-6">
                        <span className="section-motif">
                            <VoiceWaveLogo size={9} strokeWidth={2.6} />
                        </span>
                        <span className="font-mono text-xs uppercase tracking-widest font-bold text-[#52525B]">Core Capabilities</span>
                    </div>
                    <motion.h2
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-100px" }}
                        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                        className="font-display text-3xl sm:text-4xl md:text-6xl lg:text-[4.4rem] tracking-tighter font-bold text-[#09090B] mb-4 leading-[0.95]"
                    >
                        Built for <br /> <span className="text-[#A1A1AA]">trusted dictation.</span>
                    </motion.h2>
                </div>

                <div className="w-full flex flex-col gap-10 relative">
                    {/* Vertical tracking line connecting components */}
                    <div className="absolute left-[34px] md:left-1/2 top-3 bottom-3 w-[1px] bg-[#E4E4E7] hidden md:block z-0" />

                    {features.map((feature, idx) => (
                        <motion.div
                            initial={{ opacity: 0, y: 40 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-100px" }}
                            transition={{ duration: 0.8, delay: idx * 0.1, ease: [0.16, 1, 0.3, 1] }}
                            key={idx}
                            className={`flex flex-col md:flex-row gap-5 md:gap-10 items-start md:items-center relative z-10 group ${idx % 2 === 1 ? 'md:flex-row-reverse' : ''}`}
                        >
                            {/* Central node for the tracking line */}
                            <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-[#FFFFFF] border-2 border-[#E4E4E7] z-20 items-center justify-center transition-colors duration-300 group-hover:border-[#38BDF8]/65 group-active:border-[#38BDF8]">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#38BDF8] opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity" />
                            </div>

                            <div className={`w-full md:w-1/2 flex ${idx % 2 === 1 ? 'justify-start md:justify-start' : 'justify-start md:justify-end'}`}>
                                <div className="p-5 sm:p-6 md:p-7 bg-[#FFFFFF]/90 backdrop-blur-xl vw-radius-shell border border-[#E4E4E7] shadow-[0_14px_40px_-20px_rgba(0,0,0,0.05)] w-full max-w-[31rem] cursor-pointer transition-all duration-300 hover:-translate-y-0.5 hover:border-[#38BDF8]/60 hover:shadow-[0_20px_48px_-20px_rgba(56,189,248,0.2)] active:translate-y-0 active:border-[#38BDF8] active:shadow-[0_16px_36px_-18px_rgba(56,189,248,0.28)] relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-[#FAFAFA] rounded-bl-[100%] z-0" />
                                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#38BDF8] opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-active:opacity-100" />

                                    <div className="relative z-10">
                                        <div className="w-12 h-12 vw-radius-tab bg-[#09090B] group-hover:bg-[#38BDF8] group-active:bg-[#38BDF8] flex items-center justify-center text-[#FFFFFF] mb-5 shadow-inner ring-1 ring-[#09090B]/10 transition-colors duration-300">
                                            {feature.icon}
                                        </div>
                                        <h3 className="text-xl sm:text-2xl font-bold font-display tracking-tight text-[#09090B] mb-3">{feature.title}</h3>
                                        <p className="text-[#475569] leading-relaxed text-sm sm:text-base font-medium">{feature.description}</p>

                                        <div className="mt-6 pt-4 border-t border-[#F4F4F5] flex justify-between items-center">
                                            <span className="font-mono text-xs font-bold text-[#A1A1AA] uppercase">Module 0{idx + 1}</span>
                                            <span className="font-mono text-[10px] text-[#0284C7] uppercase bg-[#38BDF8]/10 px-2 py-1 rounded">Active</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className={`w-full md:w-1/2 hidden md:block ${idx % 2 === 1 ? 'text-right pr-8' : 'text-left pl-8'}`}>
                                <h4 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#94A3B8] mb-2 drop-shadow-sm">// System Contract</h4>
                                <div className="font-mono text-sm leading-relaxed text-[#0F172A] font-bold">{feature.spec}</div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}

export default function Features() {
    return <FeaturesD />;
}
