import type React from "react";
import { Bell, ChevronRight, Mic, UserCircle } from "lucide-react";
import { NAV_ITEMS, STATUS_LABEL, STATUS_META, STATUS_TONE } from "../constants";
import type { DictationState, ThemeConfig } from "../types";

interface LayoutProps {
  theme: ThemeConfig;
  children: React.ReactNode;
  activeNav: string;
  setActiveNav: (id: string) => void;
  isRecording: boolean;
  status: DictationState;
}

export const Layout: React.FC<LayoutProps> = ({
  theme,
  children,
  activeNav,
  setActiveNav,
  isRecording,
  status
}) => {
  const { colors, typography, shapes } = theme;

  return (
    <div className={`flex h-screen w-full overflow-hidden ${colors.sidebarBg} ${colors.textPrimary} ${typography.fontBody}`}>
      <aside
        className={`
          w-72 flex-shrink-0 flex flex-col justify-between relative
          ${colors.sidebarBg}
          ${theme.id !== "F" ? `${colors.border} ${shapes.borderWidth} border-r-0 border-y-0 border-l-0` : ""}
          transition-all duration-300
        `}
      >
        <div className="p-8 flex items-center gap-4">
          <div
            className={`
              w-10 h-10 flex items-center justify-center
              ${theme.id === "D" ? "bg-cyan-500 text-black shadow-lg shadow-cyan-500/20" : theme.id === "E" ? "bg-[#FF4F00] text-white rounded-none" : "bg-[#2D5B52] text-white"}
              ${shapes.radius}
              transition-all duration-300
            `}
          >
            <Mic size={20} />
          </div>
          <div>
            <span className={`${typography.fontDisplay} ${typography.weightHeading} text-xl tracking-tight block leading-none`}>
              VoiceWave
            </span>
            <span className={`text-[10px] uppercase tracking-widest opacity-50 font-medium ${typography.fontBody}`}>
              {theme.id === "E" ? "Model 2024" : "Local Core"}
            </span>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = activeNav === item.id;
            const Icon = item.icon;

            let activeClass = "";
            if (isActive) {
              if (theme.id === "D") {
                activeClass = "bg-white/10 text-white border border-white/10 shadow-[0_0_15px_rgba(255,255,255,0.05)] backdrop-blur-md";
              } else if (theme.id === "E") {
                activeClass = "bg-[#D6D4CD] text-black shadow-[inset_2px_2px_4px_rgba(0,0,0,0.1),inset_-1px_-1px_1px_rgba(255,255,255,0.5)] translate-y-[1px]";
              } else {
                activeClass = "bg-[#DCE6E2] text-[#1A3832] font-bold shadow-sm";
              }
            } else if (theme.id === "D") {
              activeClass = "text-slate-400 hover:text-white hover:bg-white/5";
            } else if (theme.id === "E") {
              activeClass = "text-[#666666] hover:bg-[#DEDCD5] hover:text-black";
            } else {
              activeClass = "text-[#5C7A72] hover:bg-[#DCE6E2]/50 hover:text-[#1A3832]";
            }

            return (
              <button
                key={item.id}
                onClick={() => setActiveNav(item.id)}
                className={`
                  w-full flex items-center justify-between px-4 py-3 text-sm transition-all duration-200 group
                  ${shapes.navItemShape}
                  ${activeClass}
                `}
                type="button"
              >
                <div className="flex items-center gap-3">
                  <Icon size={18} className={isActive ? "opacity-100" : "opacity-70 group-hover:opacity-100"} />
                  <span>{item.label}</span>
                </div>
                {isActive && theme.id === "F" && <div className="w-1.5 h-1.5 rounded-full bg-[#2D5B52]" />}
              </button>
            );
          })}
        </nav>

        <div className="p-6">
          <div
            className={`
              p-5 relative overflow-hidden group
              ${theme.id === "D" ? "bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-white/5" : theme.id === "E" ? "bg-[#D6D4CD] border-2 border-[#CCCAC2]" : "bg-[#F2F4F3] shadow-sm"}
              ${shapes.radius}
            `}
          >
            {theme.id === "D" && <div className="absolute top-0 right-0 w-20 h-20 bg-cyan-500/20 blur-[40px] rounded-full -mr-10 -mt-10" />}
            <div className="relative z-10">
              <h4 className="text-xs uppercase tracking-wider mb-1 opacity-70 font-bold">Phase III</h4>
              <p className="text-xs opacity-60 mb-4 leading-relaxed">
                Model controls and retention hardening in progress.
              </p>
              <div className="w-full text-xs py-2.5 font-medium text-center bg-[#DCE6E2] text-[#1A3832] rounded-full">
                {STATUS_LABEL[status]} | {STATUS_META[status]}
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 relative">
        <header className={`h-20 flex items-center justify-between px-10 flex-shrink-0 z-20 ${colors.sidebarBg}`}>
          <div className="flex items-center gap-3 text-sm">
            <span className="opacity-40">System</span>
            <ChevronRight size={14} className="opacity-30" />
            <span className="font-medium tracking-wide">Ready to transcribe</span>

            <div className={`ml-4 px-3 py-1 flex items-center gap-2 rounded-full text-xs font-medium ${STATUS_TONE[status]}`}>
              <div className={`w-2 h-2 rounded-full ${isRecording ? "bg-white animate-pulse" : "bg-current opacity-80"}`} />
              {STATUS_LABEL[status]}
            </div>
          </div>

          <div className="flex items-center gap-6">
            <button className="opacity-60 hover:opacity-100 transition-opacity" type="button">
              <Bell size={20} />
            </button>
            <div className="flex items-center gap-3 cursor-pointer group">
              <div
                className={`
                  w-9 h-9 flex items-center justify-center border
                  ${theme.id === "D" ? "bg-white/5 border-white/10 rounded-full" : theme.id === "E" ? "bg-[#D6D4CD] border-[#B0AEA6] rounded-sm shadow-inner" : "bg-[#F2F4F3] border-transparent rounded-full shadow-sm"}
                `}
              >
                <UserCircle size={20} className="opacity-70" />
              </div>
              <div className="text-sm hidden sm:block">
                <p className="leading-none font-medium group-hover:opacity-80">Workspace</p>
              </div>
            </div>
          </div>
        </header>

        <div className={`flex-1 overflow-hidden relative ${theme.id === "F" ? "pl-0 pb-0 pr-0" : ""}`}>
          <div
            className={`
              w-full h-full overflow-y-auto relative scroll-smooth
              ${colors.bg}
              ${theme.id === "F" ? "rounded-tl-[2.5rem] shadow-[-2px_-2px_10px_rgba(0,0,0,0.02)]" : ""}
              ${theme.id === "D" ? "rounded-tl-2xl border-t border-l border-white/10" : ""}
              ${theme.id === "E" ? "border-t-2 border-l-2 border-[#CCCAC2]" : ""}
            `}
          >
            <div className="px-10 py-10 min-h-full">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
};
