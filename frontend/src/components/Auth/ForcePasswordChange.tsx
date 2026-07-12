import { useState } from 'react';
import { API_BASE } from '../../config';

interface ForcePasswordChangeProps {
  token: string | null;
  onPasswordChanged: () => void;
}

export default function ForcePasswordChange({ token, onPasswordChanged }: ForcePasswordChangeProps) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (newPassword !== confirmPassword) {
      setError('Az új jelszavak nem egyeznek meg!');
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword })
      });
      
      if (response.ok) {
        alert("A jelszó sikeresen megváltoztatva!");
        onPasswordChanged();
      } else {
        const err = await response.json();
        setError(err.detail || 'Hiba történt a jelszó módosításakor.');
      }
    } catch (err) {
      setError('Csatlakozási hiba.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#090d16' }}>
      <form onSubmit={onSubmit} className="glass-panel" style={{ padding: '32px', width: '400px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ textAlign: 'center', marginBottom: '12px' }}>
          <h1 style={{ color: '#f59e0b', fontSize: '22px', margin: 0 }}>Jelszócsere Kötelező</h1>
          <p style={{ color: '#94a3b8', fontSize: '13px', margin: '6px 0 0 0' }}>Az alapértelmezett vagy ideiglenes jelszót kötelező megváltoztatni az első használat előtt.</p>
        </div>

        {error && (
          <div style={{ color: '#f87171', fontSize: '13px', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '8px', borderRadius: '4px' }}>
            {error}
          </div>
        )}

        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>Jelenlegi jelszó</label>
          <input 
            type="password" 
            value={oldPassword} 
            onChange={e => setOldPassword(e.target.value)} 
            required 
            style={{ width: '100%', padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} 
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>Új jelszó</label>
          <input 
            type="password" 
            value={newPassword} 
            onChange={e => setNewPassword(e.target.value)} 
            required 
            style={{ width: '100%', padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} 
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>Új jelszó megerősítése</label>
          <input 
            type="password" 
            value={confirmPassword} 
            onChange={e => setConfirmPassword(e.target.value)} 
            required 
            style={{ width: '100%', padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} 
          />
        </div>

        <button 
          type="submit" 
          disabled={loading}
          style={{ width: '100%', padding: '12px', backgroundColor: '#d97706', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', marginTop: '8px' }}
        >
          {loading ? 'Módosítás...' : 'Jelszó megváltoztatása'}
        </button>
      </form>
    </div>
  );
}
