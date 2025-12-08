import { useState } from 'react';
import type { LoginCredentials } from '../shared/types'; // Ya tienes este archivo, ¡úsalo!
 // Ya tienes este archivo, ¡úsalo!

interface LoginProps {
  onLoginSuccess: () => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('Conectando con ThingsBoard...');

    const creds: LoginCredentials = { email, password };
    // Usamos window.api gracias al preload
    const result = await window.api.login(creds);

    if (result.success) {
      onLoginSuccess();
    } else {
      setStatus(`Error: ${result.error}`);
    }
  };

  return (
    <div className="flex items-center justify-center h-full w-full">
      
      {/* TARJETA DE CRISTAL: Aquí aplicamos el diseño */}
      <div className="glass-card rounded-3xl p-8 flex flex-col items-center gap-6 w-80 shadow-2xl">
        
        <h2 className="text-3xl font-bold text-white tracking-wide">TrueFocus</h2>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full">
          <input 
            className="p-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-green-400 transition" 
            type="email" 
            placeholder="Email" 
            value={email}
            onChange={e => setEmail(e.target.value)} 
          />
          <input 
            className="p-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-green-400 transition" 
            type="password" 
            placeholder="Password" 
            value={password}
            onChange={e => setPassword(e.target.value)} 
          />
          <button className="mt-2 bg-brand-green-500 text-white font-bold py-3 rounded-xl hover:bg-brand-green-400 transition shadow-lg">
            Ingresar
          </button>
        </form>
        
        {status && <p className="text-red-300 text-sm text-center animate-pulse">{status}</p>}
      </div>
    </div>
  );
}