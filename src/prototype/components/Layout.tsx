import type React from "react";
import { Bell, PanelLeftClose, PanelLeftOpen, UserCircle } from "lucide-react";
import { useState } from "react";
import { NAV_ITEMS_BOTTOM, NAV_ITEMS_TOP } from "../constants";
import type { ThemeConfig } from "../types";

interface LayoutProps {
  theme: ThemeConfig;
  children: React.ReactNode;
  activeNav: string;
  activePopupNav?: string | null;
  setActiveNav: (id: string) => void;
  isRecording: boolean;
}

export const Layout: React.FC<LayoutProps> = ({
  theme,
  children,
  activeNav,
  activePopupNav = null,
  setActiveNav,
  isRecording
}) => {
  const { colors, typography, shapes } = theme;
  const LogoComponent = theme.logo;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const NavButton = ({ item }: { item: { id: string; label: string; icon: React.ComponentType<any> } }) => {
    const isActive = activeNav === item.id || activePopupNav === item.id;
    const Icon = item.icon;
    const activate = () => setActiveNav(item.id);
    return (
      <button
        onPointerDown={(event) => {
          event.preventDefault();
          activate();
        }}
        onClick={activate}
        aria-current={isActive ? "page" : undefined}
        title={sidebarCollapsed ? item.label : undefined}
        className={`
          w-full cursor-pointer select-none flex items-center ${sidebarCollapsed ? "justify-center px-2" : "justify-between px-4"} py-2.5 text-sm transition-all duration-200 group
          ${shapes.navItemShape}
          ${
            isActive
              ? `${colors.navActiveBg} ${colors.navActiveFg} font-bold shadow-sm border border-[#2F2F2F]/28`
              : `${colors.textSecondary} hover:bg-white/40 hover:${colors.textPrimary}`
          }
        `}
        type="button"
      >
        <div className={`flex items-center ${sidebarCollapsed ? "gap-0" : "gap-3"}`}>
          <Icon size={18} className={isActive ? "opacity-100" : "opacity-70 group-hover:opacity-100"} />
          {!sidebarCollapsed && <span>{item.label}</span>}
        </div>
        {!sidebarCollapsed && isActive && (
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundImage: colors.accentGradient }}
          />
        )}
      </button>
    );
  };

  return (
    <div className={`relative isolate flex h-screen w-full overflow-hidden ${colors.shellBg} ${colors.textPrimary} ${typography.fontBody}`}>
      <aside
        data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
        className={`relative z-40 ${sidebarCollapsed ? "w-20" : "w-52"} flex-shrink-0 flex flex-col ${colors.shellBg} transition-all duration-300`}
      >
        <div className={`${sidebarCollapsed ? "px-3 pt-4 pb-4 flex-col gap-2" : "p-6 pb-4 gap-3"} flex items-center flex-shrink-0`}>
          {sidebarCollapsed ? (
            <>
              <button
                type="button"
                className="h-8 w-8 text-[#52525B] transition hover:text-[#18181B]"
                onClick={() => setSidebarCollapsed((prev) => !prev)}
                aria-label="Expand sidebar"
                title="Expand sidebar"
              >
                <PanelLeftOpen size={17} className="mx-auto" />
              </button>
              <div
                className={`
                  w-10 h-10 aspect-square shrink-0 flex items-center justify-center rounded-full
                  ${colors.accent} ${colors.accentFg}
                  transition-all duration-300 shadow-lg shadow-black/5
                `}
              >
                <LogoComponent size={20} />
              </div>
            </>
          ) : (
            <>
              <div
                className={`
                  w-10 h-10 aspect-square shrink-0 flex items-center justify-center rounded-full
                  ${colors.accent} ${colors.accentFg}
                  transition-all duration-300 shadow-lg shadow-black/5
                `}
              >
                <LogoComponent size={20} />
              </div>
              <div>
                <span className={`${typography.fontDisplay} ${typography.weightHeading} text-xl tracking-tight block leading-none`}>
                  VoiceWave
                </span>
                <span className={`text-[10px] uppercase tracking-widest opacity-60 font-medium ${typography.fontBody} mt-1 block`}>
                  {theme.name}
                </span>
              </div>
              <button
                type="button"
                className="ml-auto h-8 w-8 text-[#52525B] transition hover:text-[#18181B]"
                onClick={() => setSidebarCollapsed((prev) => !prev)}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
              >
                <PanelLeftClose size={17} className="mx-auto" />
              </button>
            </>
          )}
        </div>

        <nav className={`relative z-50 ${sidebarCollapsed ? "px-2" : "px-4"} space-y-1 flex-shrink-0`}>
          {NAV_ITEMS_TOP.map((item) => (
            <NavButton key={item.id} item={item} />
          ))}
        </nav>

        <div className="flex-1" />

        {!sidebarCollapsed && (
          <div className="px-5 pb-4">
            <div
              className={`
                p-5 relative overflow-hidden group
                ${colors.surface} shadow-sm border ${colors.surfaceBorder}
                ${shapes.radius}
              `}
            >
              <div className="absolute -right-2 -top-2 opacity-80 pointer-events-none">
                <svg width="76" height="54" viewBox="0 0 76 54" fill="none" aria-hidden="true">
                  <path
                    d="M8 31 L30 10 L24 24 L44 20 L24 44 L28 30 Z"
                    stroke={colors.accentBlue}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="text-[10px] uppercase font-bold px-2 py-0.5 rounded text-[#3F3F46]"
                    style={{
                      backgroundImage:
                        "linear-gradient(90deg, rgba(56,189,248,0.35) 0%, rgba(163,230,53,0.35) 100%)",
                    }}
                  >
                    PRO
                  </span>
                </div>
                <p className="text-xs opacity-75 mb-4 leading-relaxed">
                  Unlimited local dictation and advanced export models.
                </p>
                <button
                  className={`w-full text-xs py-2.5 font-bold transition-opacity text-[#18181B] hover:opacity-90 ${shapes.buttonShape}`}
                  style={{
                    backgroundImage:
                      "linear-gradient(90deg, rgba(56,189,248,0.72) 0%, rgba(163,230,53,0.72) 100%)",
                    border: "1px solid rgba(24,24,27,0.08)",
                  }}
                  type="button"
                >
                  Upgrade Plan
                </button>
              </div>
            </div>
          </div>
        )}

        {!sidebarCollapsed && (
          <div className="px-6 pb-3">
            <div className={`h-px mx-1 border-t ${colors.divider}`} />
          </div>
        )}

        <nav className={`relative z-50 ${sidebarCollapsed ? "px-2" : "px-4"} pb-7 space-y-1 flex-shrink-0`}>
          {NAV_ITEMS_BOTTOM.map((item) => (
            <NavButton key={item.id} item={item} />
          ))}
        </nav>
      </aside>

      <main className="relative z-10 flex-1 flex flex-col min-w-0">
        <header className={`h-14 flex items-center justify-between px-6 flex-shrink-0 z-20 ${colors.shellBg}`}>
          <div className="flex items-center gap-3 text-sm">
            {isRecording && (
              <div className={`px-3 py-1 flex items-center gap-2 ${colors.recording} text-white rounded-full text-xs font-medium`}>
                <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                Recording
              </div>
            )}
          </div>

          <div className="flex items-center gap-6">
            <button className="opacity-60 hover:opacity-100 transition-opacity" type="button">
              <Bell size={20} />
            </button>
            <div className="flex items-center gap-3 cursor-pointer group">
              <div className={`w-9 h-9 flex items-center justify-center border ${colors.bg} border-transparent rounded-full shadow-sm`}>
                <UserCircle size={20} className="opacity-70" />
              </div>
              <div className="text-sm hidden sm:block">
                <p className="leading-none font-medium group-hover:opacity-80">Workspace</p>
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-hidden relative pr-2 pb-2">
          <div
            className={`w-full h-full overflow-y-auto relative scroll-smooth ${colors.canvasBg} rounded-[2rem] border border-[#DEE0E7] shadow-[0_8px_20px_rgba(9,9,11,0.05),0_1px_4px_rgba(9,9,11,0.03)]`}
          >
            <div className="px-6 py-6 min-h-full">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
};
