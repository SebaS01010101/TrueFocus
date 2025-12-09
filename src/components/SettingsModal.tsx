import React, { useState } from 'react';
import { X, Save, Clock, Coffee, Armchair } from 'lucide-react';
import type { PomodoroSettings } from '../shared/types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: PomodoroSettings;
  onSave: (newSettings: PomodoroSettings) => void;
}

export default function SettingsModal({ isOpen, onClose, currentSettings, onSave }: SettingsModalProps) {
  const [formData, setFormData] = useState(currentSettings);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: parseInt(value) || 0
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    // Overlay oscuro
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      
      {/* Modal Glass */}
      <div className="glass-card rounded-3xl p-8 w-full max-w-sm text-white border border-white/20 shadow-2xl animate-in fade-in zoom-in duration-200">
        
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-h4 font-bold text-white">Configuración</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          
          {/* Input: Trabajo */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-brand-green-300">
              <Clock size={16} /> Duración Trabajo (min)
            </label>
            <input
              type="number"
              name="workDuration"
              value={formData.workDuration}
              onChange={handleChange}
              className="w-full bg-white/10 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:border-brand-green-500 transition font-mono"
            />
          </div>

          {/* Input: Descanso Corto */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-blue-300">
              <Coffee size={16} /> Descanso Corto (min)
            </label>
            <input
              type="number"
              name="shortBreakDuration"
              value={formData.shortBreakDuration}
              onChange={handleChange}
              className="w-full bg-white/10 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500 transition font-mono"
            />
          </div>

          {/* Input: Descanso Largo */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-purple-300">
              <Armchair size={16} /> Descanso Largo (min)
            </label>
            <input
              type="number"
              name="longBreakDuration"
              value={formData.longBreakDuration}
              onChange={handleChange}
              className="w-full bg-white/10 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:border-purple-500 transition font-mono"
            />
          </div>

          <button 
            type="submit"
            className="mt-4 bg-brand-green-600 hover:bg-brand-green-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition shadow-lg"
          >
            <Save size={20} />
            Guardar Cambios
          </button>

        </form>
      </div>
    </div>
  );
}