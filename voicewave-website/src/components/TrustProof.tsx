import { motion } from 'framer-motion';
import { Lock, Fingerprint, Shield } from 'lucide-react';

function TrustProofD() {
    return (
        <section id="privacy" className="section-pad relative scroll-mt-28 overflow-hidden bg-transparent px-0">
            <div className="site-shell grid lg:grid-cols-2 gap-10 sm:gap-12 lg:gap-16 relative z-10 items-center">

                {/* Left: Spec / Hardware Lock Block */}
                <div className="order-2 lg:order-1 relative h-[380px] sm:h-[420px] lg:h-[460px] bg-[#FFFFFF] border border-[#E4E4E7] vw-radius-shell shadow-[0_28px_104px_rgba(0,0,0,0.07)] overflow-hidden flex flex-col p-5 sm:p-7 perspective-1000">
                    <div className="flex flex-col gap-3 border-b border-[#E4E4E7] pb-3.5 mb-6 sm:mb-7 sm:flex-row sm:justify-between sm:items-center">
                        <span className="font-mono text-xs font-bold text-[#A1A1AA] uppercase">Security Architecture</span>
                        <div className="inline-flex items-center gap-2 bg-[#F4F4F5] px-3 py-1 rounded-full border border-[#E4E4E7]">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#A3E635] animate-pulse" />
                            <span className="font-mono text-[10px] text-[#09090B] font-bold">100% LOCAL</span>
                        </div>
                    </div>

                    <div className="flex-1 flex items-center justify-center relative">
                        {/* Background radial glow */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[#38BDF8] mix-blend-multiply opacity-15 rounded-full blur-3xl -z-10" />

                        <motion.div
                            initial={{ opacity: 0, y: 24 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-100px" }}
                            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                            className="relative z-0 bg-[#09090B] w-44 h-44 rounded-3xl flex items-center justify-center shadow-2xl border border-[#27272A] transform-gpu"
                        >
                            <Shield className="w-20 h-20 text-[#27272A] absolute" />
                            <Lock className="w-11 h-11 text-[#A3E635] relative z-10" />

                            {/* Scanning line animation */}
                            <div className="absolute top-0 left-0 w-full h-full rounded-3xl overflow-hidden pointer-events-none">
                                <motion.div
                                    className="w-full h-1 bg-[#38BDF8] opacity-50 shadow-[0_0_10px_#38BDF8]"
                                    animate={{ y: [0, 176, 0] }}
                                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                                />
                            </div>
                        </motion.div>
                    </div>

                    <div className="mt-7 font-mono text-xs text-[#71717A] space-y-2 border-t border-[#E4E4E7] pt-4">
                        <div className="flex justify-between"><span>Cloud Transcription:</span><span className="text-[#09090B] font-bold">DISABLED (V1)</span></div>
                        <div className="flex justify-between"><span>Audio Path:</span><span className="text-[#09090B] font-bold">ON-DEVICE</span></div>
                        <div className="flex justify-between"><span>Diagnostics Export:</span><span className="text-[#09090B] font-bold">USER-TRIGGERED</span></div>
                    </div>
                </div>

                {/* Right: Massive Text Content */}
                <div className="order-1 lg:order-2 flex flex-col justify-center">
                    <motion.div
                        initial={{ opacity: 0, y: 24 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-100px" }}
                        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <h2 className="font-display text-5xl sm:text-6xl md:text-[5.2rem] lg:text-[6.15rem] font-bold tracking-tighter text-[#09090B] mb-6 sm:mb-7 leading-[0.87] uppercase">
                            Your <br />
                            <span className="text-[#A1A1AA]">Audio.</span> <br />
                            Your <br />
                            <span className="text-[#09090B]">Rules.</span>
                        </h2>

                        <div className="w-18 h-1 bg-[#09090B] mb-7" />

                        <p className="text-lg sm:text-xl text-[#475569] font-medium leading-relaxed max-w-[32rem] mb-7">
                            No cloud transcription in v1. Audio stays on-device, and diagnostics export is optional and initiated by you.
                        </p>

                        <div className="flex items-center gap-4 bg-[#FFFFFF] border border-[#E4E4E7] px-4 py-3 vw-radius-tab max-w-xs shadow-sm">
                            <Fingerprint className="w-5 h-5 text-[#A3E635]" />
                            <span className="text-sm font-bold text-[#09090B]">Local-First Security Posture</span>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}

export default function TrustProof() {
    return <TrustProofD />;
}
