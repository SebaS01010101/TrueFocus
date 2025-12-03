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
    <div className="flex flex-col items-center justify-center h-full space-y-4">
      <h2 className="text-2xl font-bold text-blue-400">IoT Login</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-64 text-gray-800">
        <input 
          className="p-2 rounded" 
          type="email" 
          placeholder="Email" 
          value={email}
          onChange={e => setEmail(e.target.value)} 
        />
        <input 
          className="p-2 rounded" 
          type="password" 
          placeholder="Password" 
          value={password}
          onChange={e => setPassword(e.target.value)} 
        />
        <button className="bg-blue-600 text-white p-2 rounded hover:bg-blue-500 transition">
          Ingresar
        </button>
      </form>
      <p className="text-red-400 text-sm">{status}</p>
    </div>
  );
}