import React, { useState } from 'react';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';

interface Props {
  onLoginSuccess: () => void;
}

const Login: React.FC<Props> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);
    try {
      const auth = getAuth();
      await signInWithEmailAndPassword(auth, email, password);
      onLoginSuccess();
    } catch (e) {
      const err = e as Error;
      setError(err.message);
    }
  };

  const handleSignup = async () => {
    setError(null);
    try {
      const auth = getAuth();
      await createUserWithEmailAndPassword(auth, email, password);
      onLoginSuccess();
    } catch (e) {
      const err = e as Error;
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white shadow-md rounded p-6 w-full max-w-sm space-y-4">
        <h1 className="text-xl font-bold text-center">Student Login</h1>
        <input
          type="email"
          className="w-full border p-2 rounded"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          className="w-full border p-2 rounded"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex gap-2">
          <button
            className="flex-1 bg-blue-600 text-white p-2 rounded"
            onClick={handleLogin}
          >
            Login
          </button>
          <button
            className="flex-1 bg-green-600 text-white p-2 rounded"
            onClick={handleSignup}
          >
            Sign Up
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
