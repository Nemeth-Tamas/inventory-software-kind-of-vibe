import { useState } from 'react';
import { API_BASE } from '../../config';

interface BillingoProps {
  token: string | null;
  billingoStatus: any;
  checkBillingo: () => void;
  fetchData: () => void;
}

export default function Billingo({ token, billingoStatus, checkBillingo, fetchData }: BillingoProps) {
  const [billingoKey, setBillingoKey] = useState('');
  const [importing, setImporting] = useState(false);

  const handleImportProducts = async () => {
    if (!window.confirm("Biztosan elindítja a termékek importálását a Billingo-ból?\nA termékek Billingo-ban megadott vonalkódja (EAN mező) elsőbbséget élvez. Ha az EAN mező üres, a rendszer belső 6 karakteres kódot generál.")) {
      return;
    }

    setImporting(true);
    try {
      const response = await fetch(`${API_BASE}/billingo/import`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        alert(`Sikeres termékimportálás a Billingo-ból!\nImportált új termékek: ${data.imported_count} db\nSzinkronizált meglévő termékek: ${data.updated_count} db`);
        fetchData();
      } else {
        const err = await response.json();
        alert(`Sikeres importálás sikertelen: ${err.detail || 'Ismeretlen hiba'}`);
      }
    } catch (err) {
      alert("Hálózati hiba a Billingo importálás elindításakor.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: '24px', margin: '0 0 20px 0' }}>Billingo API V3 Termékimportálás</h1>
      
      <div style={{ maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ margin: 0 }}>Termékimportálás a Billingo számlázóból</h3>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
            Ezzel a funkcióval letöltheti az összes termékét a Billingo rendszerből. A termékek belső vonalkódja (EAN kódja) alapján fognak bekerülni az adatbázisba. Amennyiben a termék nem rendelkezik EAN-kóddal, a rendszer automatikusan generál hozzá egy 6 karakteres egyedi azonosítót.
          </p>

          {(!billingoStatus || billingoStatus.status === 'Nincs beállítva') && (
            <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)', padding: '12px', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', textAlign: 'center' }}>
              ⚠️ SZIMULÁCIÓS MÓD AKTÍV (Nincs API kulcs)
            </div>
          )}
          
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>API kulcs (Billingo API V3)</label>
            <input type="password" value={billingoKey} onChange={e => setBillingoKey(e.target.value)} placeholder="Kulcs bevitele..." style={{ width: '100%', padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} />
          </div>

          <button onClick={checkBillingo} style={{ padding: '12px', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
            Billingo V3 Kapcsolat ellenőrzése
          </button>

          {billingoStatus && (
            <div style={{ backgroundColor: '#0f172a', padding: '16px', borderRadius: '6px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <div style={{ fontWeight: 'bold', color: billingoStatus.status === 'Kapcsolódás...' ? '#eab308' : billingoStatus.status === 'Kapcsolódva' ? '#22c55e' : '#ef4444', marginBottom: '4px' }}>
                  Státusz: {billingoStatus.status}
                </div>
                <p style={{ margin: 0, fontSize: '13px', color: '#cbd5e1' }}>{billingoStatus.message}</p>
              </div>

              {billingoStatus.status === 'Kapcsolódva' && (
                <div style={{ borderTop: '1px solid #1e293b', paddingTop: '12px', marginTop: '4px' }}>
                  <button 
                    onClick={handleImportProducts}
                    disabled={importing}
                    style={{
                      width: '100%',
                      padding: '12px',
                      backgroundColor: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontWeight: 'bold',
                      cursor: importing ? 'not-allowed' : 'pointer',
                      transition: '0.2s',
                      fontSize: '14px'
                    }}
                  >
                    {importing ? 'Importálás folyamatban...' : 'Termékek letöltése a Billingo-ból'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
