import React from 'react';
import { ThemeConfig } from '../types';
import { THEMES } from '../constants';

interface ThemeSwitcherProps {
  currentTheme: ThemeConfig;
  setTheme: (t: ThemeConfig) => void;
}

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({ currentTheme, setTheme }) => {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      <div className="bg-white/90 backdrop-blur-xl border border-gray-200 shadow-2xl p-4 rounded-2xl max-w-sm transition-all duration-300">
        <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Aesthetic Direction</h4>
        <div className="space-y-3">
          {Object.values(THEMES).map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t)}
              className={`
                w-full text-left p-3 rounded-xl text-sm border transition-all duration-200 flex items-center justify-between group relative overflow-hidden
                ${currentTheme.id === t.id 
                  ? 'bg-black text-white border-black shadow-lg scale-[1.02]' 
                  : 'bg-gray-50 text-gray-700 border-gray-100 hover:bg-gray-100 hover:border-gray-300'}
              `}
            >
              <div className="relative z-10">
                 <div className="flex items-baseline gap-2">
                   <span className="font-bold text-lg">{t.id}</span>
                   <span className="font-medium opacity-90">{t.name}</span>
                 </div>
                 <span className={`text-[11px] block mt-1 leading-relaxed ${currentTheme.id === t.id ? 'text-gray-300' : 'text-gray-500'}`}>
                   {t.description}
                 </span>
              </div>
              {currentTheme.id === t.id && (
                <div className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.8)]"></div>
              )}
            </button>
          ))}
        </div>
        
        <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center">
           <p className="text-[10px] text-gray-400 font-medium">
             Select a direction to prototype
           </p>
           <div className="text-[10px] bg-gray-100 px-2 py-1 rounded text-gray-500 font-mono">
             v2.0
           </div>
        </div>
      </div>
    </div>
  );
};