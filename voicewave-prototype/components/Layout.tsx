import React from 'react';
import { ThemeConfig } from '../types';
import { NAV_ITEMS } from '../constants';
import { Mic, ArrowRight, UserCircle, Bell, Command, ChevronRight } from 'lucide-react';

interface LayoutProps {
  theme: ThemeConfig;
  children: React.ReactNode;
  activeNav: string;
  setActiveNav: (id: string) => void;
  isRecording: boolean;
}

export const Layout: React.FC<LayoutProps> = ({ 
  theme, 
  children, 
  activeNav, 
  setActiveNav,
  isRecording
}) => {
  const { colors, typography, shapes, effects } = theme;

  return (
    // Root container uses sidebarBg to create the unified frame effect
    <div className={`flex h-screen w-full overflow-hidden ${colors.sidebarBg} ${colors.textPrimary} ${typography.fontBody}`}>
      {/* Sidebar */}
      <aside className={`
        w-72 flex-shrink-0 flex flex-col justify-between relative
        ${colors.sidebarBg} 
        ${/* Only apply border if it's NOT Theme F, to emphasize the seamless look for F */ theme.id !== 'F' ? `${colors.border} ${shapes.borderWidth} border-r-0 border-y-0 border-l-0` : ''}
        transition-all duration-300
      `}>
        {/* Brand Area */}
        <div className={`p-8 flex items-center gap-4`}>
          <div className={`
            w-10 h-10 flex items-center justify-center 
            ${theme.id === 'D' ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20' : 
              theme.id === 'E' ? 'bg-[#FF4F00] text-white rounded-none' : 
              'bg-[#2D5B52] text-white'} 
            ${shapes.radius}
            transition-all duration-300
          `}>
            <Mic size={20} />
          </div>
          <div>
            <span className={`${typography.fontDisplay} ${typography.weightHeading} text-xl tracking-tight block leading-none`}>
              VoiceWave
            </span>
            <span className={`text-[10px] uppercase tracking-widest opacity-50 font-medium ${typography.fontBody}`}>
               {theme.id === 'E' ? 'Model 2024' : 'Local Core'}
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = activeNav === item.id;
            const Icon = item.icon;
            
            // Dynamic Active State Styles based on Theme
            let activeClass = '';
            if (isActive) {
               if (theme.id === 'D') {
                 // Flux OS
                 activeClass = `bg-white/10 text-white border border-white/10 shadow-[0_0_15px_rgba(255,255,255,0.05)] backdrop-blur-md`;
               }
               else if (theme.id === 'E') {
                 // Field Recorder
                 activeClass = `bg-[#D6D4CD] text-black shadow-[inset_2px_2px_4px_rgba(0,0,0,0.1),inset_-1px_-1px_1px_rgba(255,255,255,0.5)] translate-y-[1px]`;
               }
               else if (theme.id === 'F') {
                 // Botanist: Soft Pill, darker than the sidebarBg to stand out
                 activeClass = `bg-[#DCE6E2] text-[#1A3832] font-bold shadow-sm`;
               }
            } else {
              if (theme.id === 'D') {
                activeClass = `text-slate-400 hover:text-white hover:bg-white/5`;
              } else if (theme.id === 'E') {
                activeClass = `text-[#666666] hover:bg-[#DEDCD5] hover:text-black`;
              } else {
                activeClass = `text-[#5C7A72] hover:bg-[#DCE6E2]/50 hover:text-[#1A3832]`;
              }
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
              >
                <div className="flex items-center gap-3">
                  <Icon size={18} className={isActive ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'} />
                  <span>{item.label}</span>
                </div>
                {isActive && theme.id === 'F' && <div className="w-1.5 h-1.5 rounded-full bg-[#2D5B52]"></div>}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className={`p-6`}>
          <div className={`
            p-5 relative overflow-hidden group
            ${theme.id === 'D' ? 'bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-white/5' : 
              theme.id === 'E' ? 'bg-[#D6D4CD] border-2 border-[#CCCAC2]' : 
              'bg-[#F2F4F3] shadow-sm'} 
            ${shapes.radius}
          `}>
            {/* Decoration for D */}
            {theme.id === 'D' && <div className="absolute top-0 right-0 w-20 h-20 bg-cyan-500/20 blur-[40px] rounded-full -mr-10 -mt-10"></div>}
            
            <div className="relative z-10">
              <h4 className={`text-xs uppercase tracking-wider mb-1 opacity-70 font-bold`}>Pro Plan</h4>
              <p className={`text-xs opacity-60 mb-4 leading-relaxed`}>Unlimited local dictation active.</p>
              <button className={`
                w-full text-xs py-2.5 font-medium transition-colors
                ${theme.id === 'D' ? 'bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/10' : 
                  theme.id === 'E' ? 'bg-[#282828] text-white rounded-sm uppercase tracking-wider hover:bg-black' : 
                  'bg-[#DCE6E2] text-[#1A3832] hover:bg-[#C8D6D0] rounded-full'} 
              `}>
                Manage Subscription
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Header - Matches Sidebar BG */}
        <header className={`
          h-20 flex items-center justify-between px-10 flex-shrink-0 z-20
          ${colors.sidebarBg}
        `}>
          {/* Breadcrumbs / Context */}
          <div className="flex items-center gap-3 text-sm">
            <span className="opacity-40">System</span>
            <ChevronRight size={14} className="opacity-30" />
            <span className={`font-medium tracking-wide`}>Ready to transcribe</span>
            
            {isRecording && (
               <div className={`
                 ml-4 px-3 py-1 flex items-center gap-2
                 ${colors.recording} text-white
                 ${theme.id === 'D' ? 'rounded-full text-xs font-bold tracking-wider' : 
                   theme.id === 'E' ? 'rounded-sm text-xs font-mono uppercase' : 
                   'rounded-full text-xs font-medium'}
               `}>
                 <div className="w-2 h-2 rounded-full bg-white animate-pulse"></div>
                 Recording
               </div>
            )}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-6">
             <button className={`opacity-60 hover:opacity-100 transition-opacity`}>
               <Bell size={20} />
             </button>
             <div className="flex items-center gap-3 cursor-pointer group">
                <div className={`
                  w-9 h-9 flex items-center justify-center border
                  ${theme.id === 'D' ? 'bg-white/5 border-white/10 rounded-full' : 
                    theme.id === 'E' ? 'bg-[#D6D4CD] border-[#B0AEA6] rounded-sm shadow-inner' : 
                    'bg-[#F2F4F3] border-transparent rounded-full shadow-sm'}
                `}>
                  <UserCircle size={20} className="opacity-70" />
                </div>
                <div className="text-sm hidden sm:block">
                  <p className={`leading-none font-medium group-hover:opacity-80`}>Workspace</p>
                </div>
             </div>
          </div>
        </header>

        {/* Canvas - The Middle Section */}
        {/* This creates the visual separation: A container that holds the main content background */}
        <div className={`
           flex-1 overflow-hidden relative
           ${/* Padding bottom/right to show the curve if desired, or just flush */ ''}
           ${theme.id === 'F' ? 'pl-0 pb-0 pr-0' : ''} 
        `}>
           <div className={`
             w-full h-full overflow-y-auto relative scroll-smooth
             ${colors.bg} /* Restore the distinct middle background */
             ${theme.id === 'F' ? 'rounded-tl-[2.5rem] shadow-[-2px_-2px_10px_rgba(0,0,0,0.02)]' : ''}
             ${theme.id === 'D' ? 'rounded-tl-2xl border-t border-l border-white/10' : ''}
             ${theme.id === 'E' ? 'border-t-2 border-l-2 border-[#CCCAC2]' : ''}
           `}>
             <div className="px-10 py-10 min-h-full">
               {children}
             </div>
           </div>
        </div>
      </main>
    </div>
  );
};