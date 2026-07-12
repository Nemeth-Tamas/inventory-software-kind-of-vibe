import { useState } from 'react';

interface LoginProps {
  handleLoginSubmit: (username: string, password: string) => Promise<any>;
  authError: string;
}

export default function Login({ handleLoginSubmit, authError }: LoginProps) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await handleLoginSubmit(username, password);
    setLoading(false);
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#090d16' }}>
      <form onSubmit={onSubmit} className="glass-panel" style={{ padding: '32px', width: '400px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ textAlign: 'center', marginBottom: '12px' }}>
          <h1 style={{ color: '#38bdf8', fontSize: '24px', margin: 0 }}>Raktárkezelő & Szerviz</h1>
          <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0 0' }}>Jelentkezzen be a folytatáshoz</p>
        </div>
        
        {authError && (
          <div style={{ color: '#f87171', fontSize: '14px', textAlign: 'center', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '8px', borderRadius: '4px' }}>
            {authError}
          </div>
        )}

        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>Felhasználónév</label>
          <input 
            type="text" 
            value={username} 
            onChange={e => setUsername(e.target.value)} 
            required 
            style={{ width: '100%', padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} 
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>Jelszó</label>
          <input 
            type="password" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            required 
            style={{ width: '100%', padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} 
          />
        </div>

        <button 
          type="submit" 
          disabled={loading}
          style={{ width: '100%', padding: '12px', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', marginTop: '8px' }}
        >
          {loading ? 'Bejelentkezés...' : 'Bejelentkezés'}
        </button>
        
        <div style={{ textAlign: 'center', fontSize: '12px', color: '#475569' }}>
          Alapértelmezett: admin / admin123
        </div>
      </form>
    </div>
  );
}
