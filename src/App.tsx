import { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';
import Login from './components/Login';
import Pomodoro from './components/Pomodoro';
import PresenceInfo from './components/PresenceInfo';
import SettingsModal from './components/SettingsModal';
import AppUsage from './components/AppUsage';
import ActivityChart from './components/ActivityChart';
import type { PomodoroSettings, AppUsageItem } from './shared/types';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [cycleCount, setCycleCount] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Estado centralizado para las apps (para que no haya error de "not defined")
  const [appsData, setAppsData] = useState<AppUsageItem[]>([]);

  // Escuchar datos del Backend (Electron)
  useEffect(() => {
    if (window.api?.onAppUsageUpdate) {
      const unsubscribe = window.api.onAppUsageUpdate((data) => {
        setAppsData(data);
      });
      return () => unsubscribe();
    }
  }, []);

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
      
      {isLoggedIn && (
        <button 
          onClick={() => setIsSettingsOpen(true)}
          className="absolute top-6 right-6 p-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md transition border border-white/10 z-50 text-white/80 hover:text-white"
        >
          <Settings size={24} />
        </button>
      )}

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        currentSettings={settings}
        onSave={setSettings}
      />

      {!isLoggedIn ? (
        <Login onLoginSuccess={() => setIsLoggedIn(true)} />
      ) : (
        // --- LAYOUT PRINCIPAL (Diseño de 2 Columnas) ---
        <div className="flex items-center justify-center w-full h-full p-6">
          <div className="grid grid-cols-[1fr_340px] grid-rows-[320px_220px] gap-4 w-full max-w-[920px]">
            
            {/* Gráfico de Actividad (arriba izquierda) */}
            <ActivityChart apps={appsData} />

            {/* Pomodoro (arriba derecha) */}
            <Pomodoro 
              onCycleComplete={handleCycleComplete} 
              settings={settings}
              currentCycle={cycleCount}
            />

            {/* Apps (abajo izquierda) */}
            <AppUsage apps={appsData} />

            {/* Presencia (abajo derecha) */}
            <PresenceInfo 
              pomodoroCount={cycleCount} 
              settings={settings}
            />

          </div>
        </div>
      )}
    </div>
  );
}

export default App;