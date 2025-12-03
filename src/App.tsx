import { useState } from 'react';
import Login from './components/Login';
import Pomodoro from './components/Pomodoro';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  return (
    <div className="h-screen w-screen bg-gray-900 text-white overflow-hidden">
      {!isLoggedIn ? (
        <Login onLoginSuccess={() => setIsLoggedIn(true)} />
      ) : (
        <Pomodoro />
      )}
    </div>
  );
}

export default App;