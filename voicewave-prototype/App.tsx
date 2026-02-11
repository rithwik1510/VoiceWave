import React, { useState } from 'react';
import { THEMES } from './constants';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { DictationState } from './types';
import { GoogleGenAI } from "@google/genai"; 

export default function App() {
  const activeTheme = THEMES.F; // Locked to Theme F (Botanist)
  const [activeNav, setActiveNav] = useState('home');
  const [status, setStatus] = useState<DictationState>('idle');

  // Toggle simulation for prototype
  const handleToggleRecord = () => {
    if (status === 'idle') {
      setStatus('listening');
      // Simulate dictation flow
      setTimeout(() => setStatus('transcribing'), 3000);
      setTimeout(() => setStatus('inserted'), 5000);
      setTimeout(() => setStatus('idle'), 7000);
    } else {
      setStatus('idle');
    }
  };

  return (
    <>
      <Layout 
        theme={activeTheme} 
        activeNav={activeNav} 
        setActiveNav={setActiveNav}
        isRecording={status === 'listening' || status === 'transcribing'}
      >
        <Dashboard 
          theme={activeTheme} 
          status={status}
          onToggleRecord={handleToggleRecord}
        />
      </Layout>
    </>
  );
}