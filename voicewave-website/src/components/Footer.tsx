import VoiceWaveLogo from './VoiceWaveLogo';
import { windowsDownloadUrl } from '../config/download';

function FooterA() {
    return (
        <footer className="py-16 px-6 bg-[#09090B] border-t border-[#27272A] relative overflow-hidden">
            {/* Technical Blueprint Grid */}
            <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,#18181B_1px,transparent_1px),linear-gradient(to_bottom,#18181B_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_100%_100%_at_50%_100%,#000_10%,transparent_80%)] opacity-80 pointer-events-none" />

            <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start gap-12 relative z-10">
                <div className="flex flex-col gap-4 text-left border-l-2 border-[#38BDF8] pl-4">
                    <span className="font-display font-bold text-3xl tracking-tight text-[#FAFAFA] uppercase">VoiceWave</span>
                    <span className="text-sm font-medium text-[#A1A1AA] max-w-xs">
                        Local processing engine. <br /> Zero telemetry. Absolute privacy.
                    </span>
                </div>

                <nav className="grid grid-cols-2 gap-x-12 gap-y-4">
                    {/* Column 1 */}
                    <div className="flex flex-col gap-4">
                        <span className="font-mono text-[10px] text-[#71717A] tracking-widest uppercase">Resources</span>
                        <a href="#" className="font-mono text-sm text-[#FAFAFA] hover:text-[#38BDF8] transition-colors">Documentation</a>
                        <a href="#" className="font-mono text-sm text-[#FAFAFA] hover:text-[#38BDF8] transition-colors">Architecture</a>
                    </div>
                    {/* Column 2 */}
                    <div className="flex flex-col gap-4">
                        <span className="font-mono text-[10px] text-[#71717A] tracking-widest uppercase">Legal</span>
                        <a href="#" className="font-mono text-sm text-[#FAFAFA] hover:text-[#38BDF8] transition-colors">Trust Center</a>
                        <a href="#" className="font-mono text-sm text-[#FAFAFA] hover:text-[#38BDF8] transition-colors">Privacy</a>
                    </div>
                </nav>
            </div>

            <div className="max-w-6xl mx-auto mt-16 pt-8 border-t border-[#27272A] flex flex-col md:flex-row justify-between items-center gap-4 relative z-10">
                <span className="font-mono text-xs text-[#71717A] uppercase tracking-widest">
                    &copy; {new Date().getFullYear()} VoiceWave Corp.
                </span>
                <div className="flex gap-4 items-center">
                    <span className="font-mono text-[10px] font-bold px-3 py-1 bg-[#18181B] text-[#A3E635] rounded border border-[#27272A] uppercase tracking-widest">
                        Status: Nominal
                    </span>
                </div>
            </div>
        </footer>
    );
}

function FooterB() {
    return (
        <footer className="py-16 px-6 border-t border-[#27272A] bg-[#09090B] relative overflow-hidden">
            {/* Deep luminous background blur decorators */}
            <div className="absolute bottom-0 right-1/4 w-[30vw] h-[30vw] bg-[#38BDF8] mix-blend-screen opacity-10 rounded-full blur-[100px] pointer-events-none translate-y-1/2" />
            <div className="absolute bottom-0 left-1/4 w-[30vw] h-[30vw] bg-[#A3E635] mix-blend-screen opacity-10 rounded-full blur-[100px] pointer-events-none translate-y-1/2" />

            <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start gap-12 relative z-10">
                <div className="flex flex-col gap-4 text-center md:text-left bg-[#18181B] border border-[#27272A] p-6 rounded-2xl md:max-w-xs w-full shadow-lg">
                    <span className="font-display font-bold text-2xl tracking-tight text-[#FAFAFA] flex items-center justify-center md:justify-start gap-2">
                        <div className="w-2 h-2 rounded-full bg-gradient-to-r from-[#38BDF8] to-[#A3E635]" />
                        VoiceWave
                    </span>
                    <span className="text-sm font-medium text-[#A1A1AA]">
                        Local Inference Engine. <br /> Local-first desktop runtime
                    </span>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 md:gap-16 w-full text-center md:text-left">
                    {/* Resources */}
                    <div className="flex flex-col gap-4">
                        <span className="font-mono text-[10px] text-[#A3E635] tracking-widest uppercase">/Resources</span>
                        <a href="#" className="font-medium text-sm text-[#FAFAFA] hover:text-[#38BDF8] transition-colors">Documentation</a>
                        <a href="#" className="font-medium text-sm text-[#FAFAFA] hover:text-[#38BDF8] transition-colors">API Reference</a>
                    </div>
                    {/* Enterprise */}
                    <div className="flex flex-col gap-4">
                        <span className="font-mono text-[10px] text-[#A3E635] tracking-widest uppercase">/Enterprise</span>
                        <a href="#" className="font-medium text-sm text-[#FAFAFA] hover:text-[#38BDF8] transition-colors">Deployment</a>
                        <a href="#" className="font-medium text-sm text-[#FAFAFA] hover:text-[#38BDF8] transition-colors">Security</a>
                    </div>
                    {/* Legal */}
                    <div className="flex flex-col gap-4">
                        <span className="font-mono text-[10px] text-[#A3E635] tracking-widest uppercase">/Legal</span>
                        <a href="#" className="font-medium text-sm text-[#FAFAFA] hover:text-[#38BDF8] transition-colors">Privacy</a>
                        <a href="#" className="font-medium text-sm text-[#FAFAFA] hover:text-[#38BDF8] transition-colors">Terms</a>
                    </div>
                    {/* System Status */}
                    <div className="flex flex-col gap-4 items-center sm:items-end col-span-2 lg:col-span-1 border-t sm:border-t-0 sm:border-l border-[#27272A] pt-6 sm:pt-0 sm:pl-6">
                        <span className="font-mono text-[10px] text-[#71717A] tracking-widest uppercase">System Status</span>
                        <div className="flex items-center gap-2 bg-[#18181B] border border-[#27272A] px-3 py-1.5 rounded-lg shadow-inner">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse shadow-[0_0_8px_#10B981]" />
                            <span className="text-xs font-mono text-[#FAFAFA]">All Systems Operational</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto mt-16 pt-8 border-t border-[#27272A] flex justify-center text-center relative z-10">
                <span className="text-xs text-[#71717A] font-medium tracking-wide">
                    &copy; {new Date().getFullYear()} VoiceWave Corp. All rights reserved.
                </span>
            </div>
        </footer>
    );
}

function FooterC() {
    return (
        <footer className="py-12 px-6 border-t border-[#38BDF8]/20 bg-[#000000] relative overflow-hidden">
            {/* Subtle Terminal Scanline Background */}
            <div className="absolute inset-0 z-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,#09090B_2px,#09090B_4px)] opacity-50 pointer-events-none" />

            <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start gap-12 relative z-10 text-[#FAFAFA]">
                <div className="flex flex-col gap-4 text-center md:text-left bg-[#09090B] border border-[#27272A] p-6 w-full md:max-w-xs shadow-lg relative group hover:border-[#38BDF8] transition-colors">
                    <div className="absolute top-0 right-0 p-1 border-b border-l border-[#27272A] text-[#71717A] text-[8px] font-mono group-hover:border-[#38BDF8] group-hover:text-[#38BDF8] transition-colors">SYS_INFO</div>
                    <span className="font-mono font-bold text-xl tracking-tight text-[#FAFAFA] uppercase">
                        VoiceWave
                    </span>
                    <span className="text-xs font-mono text-[#A1A1AA] leading-relaxed">
                        &gt; Dictation Engine.<br />
                        &gt; Strictly Local.<br />
                        &gt; Desktop Runtime
                    </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-16 w-full text-left font-mono text-sm leading-loose">
                    <div className="flex flex-col">
                        <span className="text-[#38BDF8] tracking-widest uppercase mb-4 text-xs font-bold">[ RESOURCES ]</span>
                        <a href="#" className="text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors">./Documentation</a>
                        <a href="#" className="text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors">./API_Reference</a>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[#A3E635] tracking-widest uppercase mb-4 text-xs font-bold">[ ENTERPRISE ]</span>
                        <a href="#" className="text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors">./Deployment</a>
                        <a href="#" className="text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors">./Security</a>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[#71717A] tracking-widest uppercase mb-4 text-xs font-bold">[ LEGAL ]</span>
                        <a href="#" className="text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors">./Privacy_Policy</a>
                        <a href="#" className="text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors">./Terms_Of_Service</a>
                    </div>
                    <div className="flex flex-col items-start md:items-end col-span-2 md:col-span-1 border-t md:border-t-0 md:border-l border-[#27272A] pt-6 md:pt-0 md:pl-6 border-dashed">
                        <span className="text-[#71717A] tracking-widest uppercase mb-4 text-xs font-bold w-full md:text-right">[ STATUS ]</span>
                        <div className="flex items-center gap-2 bg-[#09090B] border border-[#27272A] px-3 py-1 text-xs text-[#A3E635]">
                            <div className="w-1.5 h-1.5 bg-[#A3E635] animate-pulse" />
                            SYSTEM_ONLINE
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto mt-16 pt-8 border-t border-[#27272A] border-dashed flex justify-between items-center relative z-10 font-mono text-xs text-[#71717A]">
                <span>&copy; {new Date().getFullYear()} VoiceWave Corp.</span>
                <span className="uppercase tracking-[0.2em] hidden sm:block">End_Of_Transmission.</span>
            </div>
        </footer>
    );
}

function FooterD() {
    return (
        <footer className="relative overflow-hidden bg-[#09090B] px-0 pb-10 pt-16 sm:pt-20 md:pb-12 md:pt-24 text-[#FAFAFA]">
            <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_100%_100%_at_50%_100%,#000_10%,transparent_80%)] pointer-events-none" />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-1 bg-gradient-to-r from-transparent via-[#38BDF8] to-transparent opacity-20 blur-xl z-0" />

            <div className="site-shell relative z-10 flex w-full flex-col gap-12 md:gap-16">
                <section className="final-cta-band p-6 sm:p-7 md:p-10">
                    <div className="relative z-10 flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
                        <div className="max-w-3xl">
                            <div className="mb-4 inline-flex items-center gap-3 rounded-full border border-white/20 bg-white/5 px-3 py-1.5">
                                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/25 bg-white/10">
                                    <VoiceWaveLogo size={8} strokeWidth={2.6} />
                                </span>
                                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#D4D4D8]">Local-Only Runtime</span>
                            </div>
                            <h3 className="font-display text-3xl leading-[0.95] tracking-tight text-[#F8FAFC] sm:text-4xl md:text-5xl">
                                Private Dictation.
                            </h3>
                            <p className="mt-3 max-w-2xl text-sm text-[#CBD5E1] md:text-base">
                                Local-Only Desktop App
                            </p>
                        </div>

                        <div className="flex flex-col items-start gap-4 md:items-end">
                            <a
                                href={windowsDownloadUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="final-cta-button inline-flex items-center gap-2 px-5 py-3 font-mono text-xs font-bold uppercase tracking-[0.14em] text-white"
                            >
                                Download Setup
                            </a>
                            <div className="strip-edge-mask inline-flex flex-wrap items-center gap-2 rounded-full border border-white/20 bg-white/[0.06] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#D4D4D8]">
                                <span>Home</span>
                                <span className="text-[#64748B]">|</span>
                                <span>Demo</span>
                                <span className="text-[#64748B]">|</span>
                                <span>Privacy</span>
                                <span className="text-[#64748B]">|</span>
                                <span>Local-Only</span>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="grid items-end gap-12 md:grid-cols-12">
                    <div className="md:col-span-8 flex flex-col justify-end">
                        <div className="mb-5 inline-flex items-center gap-3">
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#27272A] bg-[#18181B]">
                                <VoiceWaveLogo size={15} strokeWidth={2.6} />
                            </span>
                            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#71717A]">Brand Mark</span>
                        </div>
                        <h2 className="mb-7 font-display text-5xl font-bold leading-[0.84] tracking-tighter uppercase sm:text-6xl md:mb-8 md:text-[10rem] lg:text-[12rem]">
                            <span className="text-[#F8FAFC] [text-shadow:0_1px_3px_rgba(0,0,0,0.45)]">Voice</span>
                            <span className="text-[#38BDF8] [text-shadow:0_1px_3px_rgba(6,78,120,0.5)]">Wave</span>
                        </h2>

                        <div className="mb-8 inline-flex items-center gap-4 rounded-full border border-[#27272A] bg-[#18181B] px-6 py-3 shadow-inner self-start">
                            <div className="h-2 w-2 rounded-full bg-[#A3E635] animate-pulse" />
                            <span className="font-mono text-xs font-bold uppercase tracking-widest text-[#A1A1AA]">Local-Only Desktop App</span>
                        </div>
                    </div>

                    <div className="md:col-span-4 flex flex-col justify-end gap-10 md:gap-12">
                        <nav className="flex flex-col gap-4 font-mono text-sm uppercase tracking-widest text-left md:text-right">
                            <a href="#" className="text-[#A1A1AA] hover:text-[#A3E635] transition-colors hover:translate-x-1 md:hover:-translate-x-1 duration-300">/ Documentation</a>
                            <a href="#" className="text-[#A1A1AA] hover:text-[#A3E635] transition-colors hover:translate-x-1 md:hover:-translate-x-1 duration-300">/ Architecture Setup</a>
                            <a href="#" className="text-[#A1A1AA] hover:text-[#A3E635] transition-colors hover:translate-x-1 md:hover:-translate-x-1 duration-300">/ GitHub Repo</a>
                            <a href="#" className="text-[#A1A1AA] hover:text-[#A3E635] transition-colors hover:translate-x-1 md:hover:-translate-x-1 duration-300">/ Privacy Policy</a>
                        </nav>

                        <div className="md:text-right border-t border-[#27272A] pt-6 flex flex-col gap-2">
                            <span className="text-xs text-[#52525B] font-mono">
                                &copy; {new Date().getFullYear()} VoiceWave Corp.
                            </span>
                            <span className="text-[10px] text-[#52525B] font-mono tracking-widest uppercase">
                                Local Mode Active.
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
}

void [FooterA, FooterB, FooterC];

export default function Footer() {
    return <FooterD />;
}
