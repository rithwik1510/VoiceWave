import React from 'react';
import { ThemeConfig, DictationState, SessionData } from '../types';
import { MOCK_SESSIONS } from '../constants';
import { 
  Mic, Play, Pause, AlertCircle, CheckCircle, Activity, 
  MoreHorizontal, Copy, Repeat, ExternalLink, Cpu, BarChart3, WifiOff, FileText, ArrowUpRight 
} from 'lucide-react';

interface DashboardProps {
  theme: ThemeConfig;
  status: DictationState;
  onToggleRecord: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ theme, status, onToggleRecord }) => {
  const { colors, typography, shapes, effects } = theme;

  const isRecording = status === 'listening' || status === 'transcribing';

  return (
    <div className="max-w-6xl mx-auto space-y-12 pb-20">
      
      {/* 1. Welcome + Status */}
      <section className="animate-in fade-in slide-in-from-bottom-4 duration-700">
        <h1 className={`${typography.fontDisplay} text-5xl mb-3 ${colors.textPrimary} tracking-tight`}>
          Good morning, Alex.
        </h1>
        <p className={`${colors.textSecondary} text-xl max-w-2xl font-light opacity-80`}>
          System is local and secure. Ready to transcribe.
        </p>
      </section>

      {/* 2. Quick Actions */}
      <section className="grid grid-cols-1 md:grid-cols-12 gap-8 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-100">
        {/* Primary Action - The Big Button */}
        <div className="md:col-span-8">
           <div className={`
             h-full p-10 flex items-center justify-between
             ${colors.surface} ${colors.border} ${shapes.borderWidth} ${shapes.radius} ${effects.shadow}
             relative overflow-hidden group transition-all duration-300
             ${isRecording ? 'ring-2 ring-opacity-50 ring-current' : ''}
           `}>
              {/* Theme D Background Effect */}
              {theme.id === 'D' && (
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              )}

              <div className="z-10 relative flex flex-col justify-center h-full">
                <h3 className={`${typography.fontDisplay} text-3xl ${colors.textPrimary} mb-3`}>
                  {status === 'idle' ? 'Start Dictation' : 'Listening...'}
                </h3>
                <p className={`${colors.textSecondary} flex items-center gap-3`}>
                   {status === 'idle' ? (
                     <>Press <kbd className={`px-2 py-1 ${colors.surfaceHighlight} border ${colors.border} ${shapes.radius} text-xs font-mono opacity-80`}>Space</kbd> to begin</>
                   ) : (
                     <span className="flex items-center gap-2">
                       <span className="w-2 h-2 rounded-full bg-current animate-bounce"></span>
                       <span className="w-2 h-2 rounded-full bg-current animate-bounce delay-75"></span>
                       <span className="w-2 h-2 rounded-full bg-current animate-bounce delay-150"></span>
                     </span>
                   )}
                </p>
              </div>

              <button 
                onClick={onToggleRecord}
                className={`
                z-10 relative h-24 w-24 flex items-center justify-center transition-all duration-300
                ${isRecording ? colors.recording : colors.accent} 
                ${colors.accentFg} ${shapes.buttonShape}
                hover:opacity-90 hover:scale-[1.02] active:scale-[0.98]
                ${theme.id === 'D' ? 'shadow-[0_0_40px_rgba(6,182,212,0.4)]' : ''}
                ${theme.id === 'E' ? 'shadow-[4px_4px_0px_rgba(0,0,0,0.2)] active:shadow-none active:translate-x-1 active:translate-y-1' : ''}
              `}>
                {isRecording ? <Pause size={32} fill="currentColor" /> : <Mic size={32} />}
              </button>
           </div>
        </div>

        {/* Secondary Actions */}
        <div className="md:col-span-4 flex flex-col gap-4">
           {/* Model Selector */}
           <div className={`
             flex-1 p-6 flex items-center justify-between cursor-pointer group transition-all
             ${colors.surface} ${colors.border} ${shapes.borderWidth} ${shapes.radius} ${effects.shadow}
             ${theme.id === 'E' ? 'hover:bg-[#EAE8E3]' : 'hover:bg-opacity-80'}
           `}>
              <div className="flex items-center gap-4">
                 <div className={`p-3 ${theme.id === 'D' ? 'bg-white/5' : 'bg-black/5'} ${shapes.radius}`}>
                    <Cpu size={20} className={colors.textTertiary} />
                 </div>
                 <div>
                   <p className={`text-sm font-bold ${colors.textPrimary} mb-0.5`}>Model</p>
                   <p className={`text-xs ${colors.textSecondary} font-mono`}>Whisper v3-Turbo</p>
                 </div>
              </div>
              <div className={`w-2.5 h-2.5 rounded-full ${colors.success} shadow-[0_0_10px_currentColor]`}></div>
           </div>

           {/* Mode Toggle */}
           <div className={`
             flex-1 p-6 flex items-center justify-between cursor-pointer group transition-all
             ${colors.surface} ${colors.border} ${shapes.borderWidth} ${shapes.radius} ${effects.shadow}
             ${theme.id === 'E' ? 'hover:bg-[#EAE8E3]' : 'hover:bg-opacity-80'}
           `}>
               <div className="flex items-center gap-4">
                 <div className={`p-3 ${theme.id === 'D' ? 'bg-white/5' : 'bg-black/5'} ${shapes.radius}`}>
                    <Activity size={20} className={colors.textTertiary} />
                 </div>
                 <div>
                   <p className={`text-sm font-bold ${colors.textPrimary} mb-0.5`}>Mode</p>
                   <p className={`text-xs ${colors.textSecondary} font-mono`}>Continuous</p>
                 </div>
              </div>
              <span className={`text-[10px] font-bold border px-2 py-1 ${shapes.radius} ${colors.border} ${colors.textTertiary} tracking-wider`}>
                AUTO
              </span>
           </div>
        </div>
      </section>

      {/* 3. Setup / Health Card */}
      <section className={`
        p-6 flex flex-wrap items-center justify-around gap-6
        ${theme.id === 'D' ? 'bg-white/5 border border-white/5' : ''}
        ${theme.id === 'E' ? 'bg-transparent border-t-2 border-b-2 border-[#CCCAC2] py-8' : ''}
        ${theme.id === 'F' ? 'bg-white shadow-sm' : ''}
        ${shapes.radius} animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200
      `}>
         <div className="flex items-center gap-4">
            <div className={`p-2 rounded-full ${theme.id === 'D' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>
              <CheckCircle size={20} />
            </div>
            <div className="flex flex-col">
              <span className={`text-sm font-bold ${colors.textPrimary}`}>Microphone</span>
              <span className={`text-xs ${colors.textSecondary}`}>Default Input (100%)</span>
            </div>
         </div>
         
         <div className={`w-[1px] h-10 ${theme.id === 'D' ? 'bg-white/10' : 'bg-black/10'}`}></div>

         <div className="flex items-center gap-4">
            <div className={`p-2 rounded-full ${theme.id === 'D' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>
              <WifiOff size={20} />
            </div>
            <div className="flex flex-col">
              <span className={`text-sm font-bold ${colors.textPrimary}`}>Privacy Core</span>
              <span className={`text-xs ${colors.textSecondary}`}>Offline & Local</span>
            </div>
         </div>

         <div className={`w-[1px] h-10 ${theme.id === 'D' ? 'bg-white/10' : 'bg-black/10'}`}></div>

         <div className="flex items-center gap-4">
             <div className={`p-2 rounded-full ${theme.id === 'D' ? 'bg-white/10 text-white' : 'bg-gray-100 text-gray-600'}`}>
              <CheckCircle size={20} />
             </div>
             <div className="flex flex-col">
               <span className={`text-sm font-bold ${colors.textPrimary}`}>Permissions</span>
               <span className={`text-xs ${colors.textSecondary}`}>MacOS Granted</span>
             </div>
         </div>
      </section>

      {/* 4. Performance Chips */}
      <section className="animate-in fade-in slide-in-from-bottom-10 duration-700 delay-300">
        <h4 className={`text-xs font-bold uppercase tracking-widest ${colors.textTertiary} mb-4 ml-1`}>Performance</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { label: 'Day Streak', value: '12', unit: 'days', color: theme.id === 'D' ? 'text-cyan-400' : 'text-blue-600' },
            { label: 'Words Today', value: '2,401', unit: 'words', color: colors.textPrimary },
            { label: 'Avg Speed', value: '145', unit: 'wpm', color: theme.id === 'E' ? 'text-[#008F39]' : colors.success },
            { label: 'Accuracy', value: '99.2', unit: '%', color: theme.id === 'E' ? 'text-[#008F39]' : colors.success },
          ].map((stat, i) => (
            <div key={i} className={`
              p-5 flex flex-col items-start justify-center transition-transform hover:-translate-y-1
              ${theme.id === 'D' ? 'bg-white/5 border border-white/5 hover:bg-white/10' : ''}
              ${theme.id === 'E' ? 'bg-[#DFDDD6] border-b-2 border-r-2 border-[#CCCAC2]' : ''}
              ${theme.id === 'F' ? 'bg-white' : ''}
              ${shapes.radius}
            `}>
               <span className={`text-[10px] uppercase tracking-wide ${colors.textTertiary} font-bold mb-2 opacity-70`}>{stat.label}</span>
               <div className="flex items-baseline gap-1.5">
                 <span className={`text-3xl ${typography.fontDisplay} font-bold ${stat.color === colors.textPrimary ? colors.textPrimary : stat.color}`}>
                   {stat.value}
                 </span>
                 <span className={`text-xs ${colors.textSecondary} font-medium`}>{stat.unit}</span>
               </div>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Recent Sessions */}
      <section className="animate-in fade-in slide-in-from-bottom-12 duration-700 delay-500">
        <div className="flex items-center justify-between mb-6">
           <h3 className={`${typography.fontDisplay} text-xl font-bold ${colors.textPrimary}`}>Recent Sessions</h3>
           <button className={`text-sm font-medium ${colors.textSecondary} hover:${colors.textPrimary} flex items-center gap-1 transition-colors`}>
             View All <ArrowUpRight size={14} />
           </button>
        </div>
        
        <div className={`flex flex-col gap-4`}>
           {MOCK_SESSIONS.map((session) => (
             <div key={session.id} className={`
               group flex items-center justify-between p-5 transition-all
               ${colors.surface} ${colors.border} ${shapes.borderWidth} ${shapes.radius}
               ${theme.id === 'D' ? 'hover:bg-white/10 hover:border-white/20' : ''}
               ${theme.id === 'E' ? 'hover:bg-[#EAE8E3] hover:border-black/20' : ''}
               ${theme.id === 'F' ? 'hover:shadow-md' : ''}
             `}>
                <div className="flex items-start gap-5">
                  <div className={`
                    w-12 h-12 flex items-center justify-center shrink-0 transition-colors
                    ${theme.id === 'D' ? 'bg-white/5 text-cyan-400 group-hover:bg-cyan-500 group-hover:text-black' : ''}
                    ${theme.id === 'E' ? 'bg-[#D6D4CD] text-black border border-[#B0AEA6]' : ''}
                    ${theme.id === 'F' ? 'bg-[#EBF0EE] text-[#2D5B52]' : ''}
                    ${shapes.radius}
                  `}>
                    <FileText size={22} />
                  </div>
                  <div>
                    <h4 className={`text-base font-bold ${colors.textPrimary} mb-1 group-hover:underline decoration-1 underline-offset-4`}>
                      {session.title}
                    </h4>
                    <p className={`text-sm ${colors.textSecondary} line-clamp-1 max-w-md font-medium opacity-80`}>
                      {session.preview}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-8">
                   <div className="text-right hidden sm:block">
                     <p className={`text-sm ${colors.textPrimary} font-bold font-mono`}>{session.duration}</p>
                     <p className={`text-xs ${colors.textTertiary}`}>{session.date}</p>
                   </div>
                   
                   {/* Row Actions */}
                   <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                      <button title="Copy Text" className={`p-2.5 rounded-lg hover:shadow-sm ${theme.id === 'D' ? 'hover:bg-white/10 text-white' : 'hover:bg-black/5 text-black'}`}>
                        <Copy size={16} />
                      </button>
                      <button title="Open" className={`p-2.5 rounded-lg hover:shadow-sm ${theme.id === 'D' ? 'hover:bg-white/10 text-white' : 'hover:bg-black/5 text-black'}`}>
                         <ExternalLink size={16} />
                      </button>
                   </div>
                </div>
             </div>
           ))}
        </div>
      </section>
    </div>
  );
};