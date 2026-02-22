import { motion } from 'framer-motion';
import { ChevronRight, Download, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { windowsDownloadUrl } from '../config/download';
import VoiceWaveLogo from './VoiceWaveLogo';

const topLinks = [
    { href: '#home', label: 'Home' },
    { href: '#demo', label: 'Demo' },
    { href: '#privacy', label: 'Privacy' },
];

export default function Header() {
    const [showFloatingDock, setShowFloatingDock] = useState(false);
    const rafRef = useRef<number | null>(null);
    const dockVisibleRef = useRef(false);

    useEffect(() => {
        const commitScrollState = () => {
            rafRef.current = null;
            const y = window.scrollY || window.pageYOffset || 0;
            const nextShowFloatingDock = dockVisibleRef.current ? y > 240 : y > 360;

            if (dockVisibleRef.current !== nextShowFloatingDock) {
                dockVisibleRef.current = nextShowFloatingDock;
                setShowFloatingDock(nextShowFloatingDock);
            }
        };

        const onScroll = () => {
            if (rafRef.current !== null) {
                return;
            }
            rafRef.current = window.requestAnimationFrame(commitScrollState);
        };

        commitScrollState();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            window.removeEventListener('scroll', onScroll);
            if (rafRef.current !== null) {
                window.cancelAnimationFrame(rafRef.current);
            }
        };
    }, []);

    return (
        <>
            <motion.header
                initial={{ y: -16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                className="relative z-50"
            >
                <div
                    className="relative w-full overflow-hidden bg-[linear-gradient(96deg,rgba(220,241,255,0.8)_0%,rgba(250,250,250,0.86)_46%,rgba(234,248,227,0.78)_100%)]"
                >
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(250px_86px_at_8%_10%,rgba(56,189,248,0.18),transparent_72%),radial-gradient(250px_86px_at_92%_92%,rgba(163,230,53,0.16),transparent_72%)] opacity-70" />
                    <div className="site-shell relative grid grid-cols-[auto_1fr_auto] items-center gap-3 px-2 py-3 sm:gap-5 md:px-4 md:py-3.5">
                        <a href="#home" className="flex items-center gap-2 text-[#09090B] shrink-0">
                            <div className="h-8 w-8 rounded-lg border border-[#111827]/70 bg-[linear-gradient(166deg,#05070B_0%,#09090B_58%,#111827_100%)] flex items-center justify-center shadow-[0_10px_18px_-14px_rgba(9,9,11,0.72)] sm:h-9 sm:w-9">
                                <VoiceWaveLogo size={13} strokeWidth={2.8} />
                            </div>
                            <span className="font-display text-[1.56rem] leading-none tracking-tight sm:text-[1.9rem]">VoiceWave</span>
                        </a>

                        <nav className="hidden md:flex items-center justify-center gap-10">
                            {topLinks.map((link) => (
                                <a
                                    key={link.href}
                                    href={link.href}
                                    className="top-nav-link group inline-flex items-center gap-1.5 font-mono text-[13px] font-bold uppercase tracking-[0.16em] text-[#18181B]"
                                >
                                    <span>{link.label}</span>
                                    <ChevronRight className="h-4 w-4 text-[#64748B] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[#0F172A]" />
                                </a>
                            ))}
                        </nav>

                        <div className="flex items-center justify-end gap-2">
                            <div className="hidden lg:flex items-center gap-1 rounded-full border border-[#E4E4E7]/80 bg-[linear-gradient(90deg,rgba(255,255,255,0.74),rgba(249,251,253,0.6))] px-3.5 py-2 text-[11px] font-mono uppercase tracking-[0.14em] text-[#52525B] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                                <ShieldCheck className="w-3.5 h-3.5 text-[#A3E635]" />
                                Local-Only
                            </div>
                            <a
                                href={windowsDownloadUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="top-nav-cta inline-flex items-center gap-2 rounded-full px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] sm:px-5 sm:py-2.5 sm:text-[12px]"
                            >
                                <span className="top-cta-text-shine sm:hidden">Download</span>
                                <span className="top-cta-text-shine hidden sm:inline">Download Desktop</span>
                                <Download className="hidden h-3.5 w-3.5 text-white/90 sm:block" />
                            </a>
                        </div>
                    </div>
                </div>
            </motion.header>

            <nav
                className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-2xl hidden md:block transform-gpu transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] [will-change:opacity] ${
                    showFloatingDock ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`}
                aria-hidden={!showFloatingDock}
            >
                <div
                    className={`dock-shell relative overflow-hidden rounded-full border border-white/18 bg-[linear-gradient(168deg,rgba(5,5,7,0.9)_0%,rgba(12,12,15,0.84)_56%,rgba(20,20,24,0.78)_100%)] shadow-[0_14px_30px_-16px_rgba(9,9,11,0.48)] transform-gpu transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                        showFloatingDock ? 'translate-y-0' : 'translate-y-10'
                    }`}
                >
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120px_64px_at_8%_0%,rgba(56,189,248,0.14),transparent_72%),radial-gradient(136px_68px_at_92%_100%,rgba(163,230,53,0.14),transparent_72%)] opacity-60" />
                    <div className="pointer-events-none absolute inset-[1px] rounded-full border border-white/14" />
                    <div className="relative flex items-center justify-between gap-3 px-2 py-2">
                        <div className="flex min-w-[132px] items-center gap-2 pl-4 shrink-0">
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.06] ring-1 ring-white/[0.12]">
                                <VoiceWaveLogo size={14} strokeWidth={2.6} />
                            </span>
                            <span className="font-sans text-[15px] font-extrabold leading-none tracking-[0.01em]">
                                <span className="text-[#F8FAFC] [text-shadow:0_1px_2px_rgba(0,0,0,0.55)]">Voice</span>
                                <span className="text-[#38BDF8] [text-shadow:0_1px_2px_rgba(8,47,73,0.65)]">Wave</span>
                            </span>
                        </div>

                        <div className="strip-edge-mask flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-2 py-1">
                            <a
                                href="#home"
                                className="text-sm font-semibold text-[#D4D4D8] hover:text-[#FAFAFA] hover:bg-white/10 px-3 py-1.5 rounded-full transition-colors"
                            >
                                Home
                            </a>
                            <a
                                href="#demo"
                                className="text-sm font-semibold text-[#D4D4D8] hover:text-[#FAFAFA] hover:bg-white/10 px-3 py-1.5 rounded-full transition-colors"
                            >
                                Demo
                            </a>
                            <a
                                href="#privacy"
                                className="text-sm font-semibold text-[#D4D4D8] hover:text-[#FAFAFA] hover:bg-white/10 px-3 py-1.5 rounded-full transition-colors"
                            >
                                Privacy
                            </a>
                        </div>

                        <div className="flex items-center gap-2 pr-1 shrink-0">
                            <span className="hidden lg:inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/10 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.14em] text-[#D4D4D8]">
                                <ShieldCheck className="w-3 h-3 text-[#A3E635]" />
                                Local-Only
                            </span>
                            <a
                                href="#home"
                                className="flex items-center gap-2 bg-[#FAFAFA] hover:bg-[#E4E4E7] text-[#09090B] px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wide transition-all active:scale-95"
                            >
                                <span>Top</span>
                            </a>
                        </div>
                    </div>
                </div>
            </nav>
        </>
    );
}
