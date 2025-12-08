import { useState } from 'react';
import { Settings } from 'lucide-react'; // Icono de engranaje
import Login from './components/Login';
import Pomodoro from './components/Pomodoro';
import PresenceInfo from './components/PresenceInfo';
import SettingsModal from './components/SettingsModal';
import type { PomodoroSettings } from './shared/types';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [cycleCount, setCycleCount] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // --- ESTADO CENTRAL DE LA CONFIGURACIÓN ---
  const [settings, setSettings] = useState<PomodoroSettings>({
    workDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 30
  });

  const handleCycleComplete = () => {
    setCycleCount(prev => prev + 1);
  };

  return (
    <div className="h-screen w-screen text-white overflow-hidden flex flex-col items-center justify-center bg-transparent">
      
      {/* Botón de Configuración (Solo visible si logueado) */}
      {isLoggedIn && (
        <button 
          onClick={() => setIsSettingsOpen(true)}
          className="absolute top-6 right-6 p-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md transition border border-white/10 z-10 text-white/80 hover:text-white"
        >
          <Settings size={24} />
        </button>
      )}

      {/* Modal */}
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        currentSettings={settings}
        onSave={setSettings}
      />

      {!isLoggedIn ? (
        <Login onLoginSuccess={() => setIsLoggedIn(true)} />
      ) : (
        <div className="flex flex-col items-center gap-6 w-full max-w-md px-4 overflow-y-auto max-h-screen py-8 scrollbar-hide">
          
          {/* Pasamos la configuración al Pomodoro */}
          <Pomodoro 
            onCycleComplete={handleCycleComplete} 
            settings={settings}
            currentCycle={cycleCount}
          />
          
          {/* Pasamos la configuración a PresenceInfo */}
          <PresenceInfo 
            pomodoroCount={cycleCount} 
            settings={settings}
          />
        </div>
      )}
    </div>
  );
}

export default App;