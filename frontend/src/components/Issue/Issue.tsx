import React, { useState, useEffect, useRef } from 'react';
import { Trash2, AlertTriangle, Scan, CheckCircle, Search, Info } from 'lucide-react';
import confetti from 'canvas-confetti';
import { API_BASE } from '../../config';

interface IssueProps {
  token: string | null;
  issueCart: any[];
  setIssueCart: React.Dispatch<React.SetStateAction<any[]>>;
  issueLocation: string;
  setIssueLocation: (val: string) => void;
  issueReason: string;
  setIssueReason: (val: string) => void;
  issueRef: string;
  setIssueRef: (val: string) => void;
  locations: any[];
  fetchData: () => void;
  products: any[];
  playBeep: (freq?: number, duration?: number, volume?: number) => void;
}

export default function Issue({
  token, issueCart, setIssueCart, issueLocation, setIssueLocation,
  issueReason, setIssueReason, issueRef, setIssueRef, locations, fetchData,
  products, playBeep
}: IssueProps) {
  
  const [scanInput, setScanInput] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [lastScanned, setLastScanned] = useState<any>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'warn' | 'info' } | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto focus input on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Flash message handler
  const showFeedback = (text: string, type: 'success' | 'warn' | 'info') => {
    setFeedbackMsg({ text, type });
    const timer = setTimeout(() => setFeedbackMsg(null), 3000);
    return () => clearTimeout(timer);
  };

  // Search logic as user types
  useEffect(() => {
    if (!scanInput.trim()) {
      setSearchResults([]);
      return;
    }

    const query = scanInput.toLowerCase().trim();

    // 1. If exactly 6 digits, auto-submit immediately (direct match or unknown barcode)
    if (query.length === 6 && /^\d+$/.test(query)) {
      const match = products.find(p => p.barcode.toLowerCase() === query);
      if (match) {
        addToCart(match);
      } else {
        playBeep(400, 0.3);
        showFeedback("Ismeretlen vonalkód", "warn");
        alert(`Ismeretlen vonalkód a kiadáshoz: ${scanInput.trim()}`);
      }
      setScanInput('');
      return;
    }

    // Otherwise, perform fuzzy search
    const fuzzyMatchWord = (text: string, queryWord: string): boolean => {
      const t = text.toLowerCase();
      const q = queryWord.toLowerCase();
      let tIdx = 0;
      let qIdx = 0;
      while (tIdx < t.length && qIdx < q.length) {
        if (t[tIdx] === q[qIdx]) {
          qIdx++;
        }
        tIdx++;
      }
      return qIdx === q.length;
    };

    const words = query.split(/\s+/);
    const filtered = products.filter(p => {
      return words.every(word => {
        const fields = [
          p.name || '',
          p.barcode || '',
          p.ean || '',
          p.sku || ''
        ];
        return fields.some(field => fuzzyMatchWord(field, word));
      });
    }).slice(0, 5);

    setSearchResults(filtered);
  }, [scanInput, products]);

  const addToCart = (product: any) => {
    setIssueCart(prev => {
      const existing = prev.find(item => item.product_id === product.id);
      if (existing) {
        // Warning if quantity exceeds stock
        if (existing.quantity + 1 > product.current_stock && !product.allow_negative_stock) {
          showFeedback(`Figyelem: A készlet nem elégséges!`, 'warn');
          playBeep(400, 0.25);
        } else {
          showFeedback(`Mennyiség növelve: ${product.name}`, 'success');
          playBeep(1200, 0.1);
        }
        return prev.map(item => item.product_id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      
      if (product.current_stock <= 0 && !product.allow_negative_stock) {
        showFeedback(`Figyelem: Nincs készleten!`, 'warn');
        playBeep(400, 0.25);
      } else {
        showFeedback(`Termék hozzáadva: ${product.name}`, 'success');
        playBeep(1200, 0.15);
      }

      return [...prev, {
        product_id: product.id,
        name: product.name,
        barcode: product.barcode,
        quantity: 1,
        stock: product.current_stock,
        allow_negative_stock: product.allow_negative_stock
      }];
    });
    setLastScanned(product);
  };

  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanInput.trim()) return;

    const query = scanInput.trim().toLowerCase();
    const match = products.find(p => 
      p.barcode.toLowerCase() === query || 
      (p.ean && p.ean.toLowerCase() === query) ||
      (p.sku && p.sku.toLowerCase() === query)
    );

    if (match) {
      addToCart(match);
      setScanInput('');
    } else {
      playBeep(400, 0.3);
      showFeedback("Ismeretlen vonalkód", "warn");
      alert(`Ismeretlen vonalkód a kiadáshoz: ${scanInput}`);
      setScanInput('');
    }
  };

  const handleFinalizeIssue = async () => {
    if (issueCart.length === 0 || !issueLocation) {
      return;
    }

    // Check if any cart item exceeds stock when negative stock is not allowed
    const hasInvalidQty = issueCart.some(item => item.quantity > item.stock && !item.allow_negative_stock);
    if (hasInvalidQty) {
      playBeep(400, 0.3);
      alert("A kiadás nem véglegesíthető, mert néhány tételből nincs elegendő készlet, és a negatív készlet nem engedélyezett!");
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/inventory/issue`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          items: issueCart.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
          location_id: issueLocation,
          reason: issueReason,
          reference_number: issueRef
        })
      });
      if (response.ok) {
        confetti();
        setIssueCart([]);
        setIssueRef('');
        setLastScanned(null);
        showFeedback("Kiadás sikeresen rögzítve!", 'success');
        fetchData();
      } else {
        const err = await response.json();
        alert(`Hiba a kiadás rögzítése során: ${err.detail}`);
      }
    } catch (err) {
      alert("Hiba a mentés során");
    }
  };

  const isCartValid = () => {
    if (issueCart.length === 0 || !issueLocation) return false;
    // Block if quantity > stock and allow_negative_stock is false
    return !issueCart.some(item => item.quantity > item.stock && !item.allow_negative_stock);
  };

  return (
    <div>
      <h1 style={{ fontSize: '24px', margin: '0 0 20px 0' }}>Kiadás</h1>

      {/* Feedback Messages */}
      {feedbackMsg && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', zIndex: 1000,
          backgroundColor: feedbackMsg.type === 'success' ? '#15803d' : '#b91c1c',
          color: 'white', padding: '12px 24px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold',
          animation: 'slideIn 0.3s ease-out'
        }}>
          {feedbackMsg.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
          {feedbackMsg.text}
        </div>
      )}

      {/* Scanner & Search Input Container */}
      <div 
        onClick={() => inputRef.current?.focus()}
        className="glass-panel" 
        style={{
          padding: '24px', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '12px',
          border: '1px solid #ef4444', cursor: 'text', position: 'relative'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Scan size={24} style={{ color: '#ef4444', animation: 'pulse 2s infinite' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#f8fafc' }}>
              Kattintson ide, majd olvassa be a kiadandó termék vonalkódját
            </div>
            <div style={{ fontSize: '13px', color: '#94a3b8' }}>
              Vagy keressen terméknév, vonalkód vagy cikkszám alapján
            </div>
          </div>
        </div>

        <form onSubmit={handleInputSubmit} style={{ position: 'relative', marginTop: '8px' }}>
          <input
            ref={inputRef}
            type="text"
            value={scanInput}
            onChange={e => setScanInput(e.target.value)}
            placeholder="Olvassa be vagy gépeljen ide..."
            style={{
              width: '100%', padding: '12px 16px 12px 40px', backgroundColor: '#090d16',
              border: '1px solid #1e293b', color: '#f8fafc', borderRadius: '8px', fontSize: '15px',
              boxSizing: 'border-box'
            }}
          />
          <Search size={18} style={{ position: 'absolute', left: '14px', top: '15px', color: '#64748b' }} />
          
          {/* Fuzzy Search Results Dropdown */}
          {searchResults.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#0f172a',
              border: '1px solid #1e293b', borderRadius: '0 0 8px 8px', zIndex: 10, boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
              maxHeight: '250px', overflowY: 'auto'
            }}>
              {searchResults.map(p => (
                <div
                  key={p.id}
                  onClick={() => {
                    addToCart(p);
                    setScanInput('');
                  }}
                  style={{
                    padding: '12px 16px', borderBottom: '1px solid #1e293b', cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    transition: 'background-color 0.2s'
                  }}
                  className="search-item-hover"
                >
                  <div>
                    <strong style={{ color: '#f8fafc', display: 'block' }}>{p.name}</strong>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>Vonalkód: {p.barcode} | SKU: {p.sku || '-'}</span>
                  </div>
                  <span style={{ fontSize: '12px', color: '#f43f5e', backgroundColor: 'rgba(244,63,94,0.1)', padding: '4px 8px', borderRadius: '4px' }}>
                    Készlet: {p.current_stock} db
                  </span>
                </div>
              ))}
            </div>
          )}
        </form>
      </div>

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '24px' }}>
        
        {/* Left Side: Items List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Last Scanned Product Details Card */}
          {lastScanned && (
            <div className="glass-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '16px', borderLeft: '4px solid #ef4444', backgroundColor: 'rgba(239,68,68,0.05)' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '6px', backgroundColor: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
                OUT
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '11px', color: '#f87171', fontWeight: 'bold', textTransform: 'uppercase' }}>Utoljára beolvasva</span>
                <strong style={{ display: 'block', fontSize: '16px', color: '#f8fafc' }}>{lastScanned.name}</strong>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>Vonalkód: {lastScanned.barcode} | Elérhető készlet: {lastScanned.current_stock} db</span>
              </div>
            </div>
          )}

          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Kiadandó tételek</h3>

            {issueCart.length === 0 ? (
              <div style={{ padding: '60px 40px', textAlign: 'center', color: '#64748b', border: '2px dashed #1e293b', borderRadius: '8px' }}>
                Még nincs kiadandó tétel. Olvasson be egy vonalkódot vagy keressen terméket.
              </div>
            ) : (
              <table className="dense-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Belső kód</th>
                    <th>Termék név</th>
                    <th style={{ width: '100px' }}>Mennyiség</th>
                    <th>Raktárkészlet</th>
                    <th style={{ textAlign: 'center' }}>Állapot</th>
                    <th>Művelet</th>
                  </tr>
                </thead>
                <tbody>
                  {issueCart.map(item => {
                    const exceedsStock = item.quantity > item.stock;
                    const blockIssue = exceedsStock && !item.allow_negative_stock;

                    return (
                      <tr key={item.product_id}>
                        <td style={{ fontFamily: 'monospace', color: '#f87171' }}>{item.barcode}</td>
                        <td style={{ fontWeight: '500' }}>
                          {item.name}
                          {exceedsStock && (
                            <span 
                              title={blockIssue ? "Hiba! A kiadandó mennyiség meghaladja a készletet és a negatív készlet tiltva van." : "Figyelem! A készlet negatívba fog átváltani."} 
                              style={{ marginLeft: '8px', color: blockIssue ? '#ef4444' : '#f59e0b', cursor: 'help', display: 'inline-flex', alignItems: 'center' }}
                            >
                              <AlertTriangle size={14} />
                            </span>
                          )}
                        </td>
                        <td>
                          <input 
                            type="number" 
                            min="1"
                            value={item.quantity} 
                            onChange={e => {
                              const val = Math.max(1, Number(e.target.value) || 1);
                              setIssueCart(prev => prev.map(i => i.product_id === item.product_id ? { ...i, quantity: val } : i));
                            }}
                            style={{
                              width: '80px', padding: '6px', backgroundColor: '#0f172a',
                              border: blockIssue ? '1px solid #ef4444' : exceedsStock ? '1px solid #f59e0b' : '1px solid #334155',
                              color: blockIssue ? '#ef4444' : exceedsStock ? '#f59e0b' : 'white', borderRadius: '4px'
                            }} 
                          />
                        </td>
                        <td style={{ fontWeight: 'bold' }}>{item.stock} db</td>
                        <td style={{ textAlign: 'center' }}>
                          {blockIssue ? (
                            <span className="badge badge-danger">Készlethiány (Tiltva)</span>
                          ) : exceedsStock ? (
                            <span className="badge badge-warning">Negatív engedve</span>
                          ) : (
                            <span className="badge badge-success">Rendben</span>
                          )}
                        </td>
                        <td>
                          <button 
                            onClick={() => setIssueCart(prev => prev.filter(i => i.product_id !== item.product_id))} 
                            style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: 'none', padding: '6px 10px', color: '#f87171', borderRadius: '4px', cursor: 'pointer' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Side: Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '16px' }}>Kiadás adatai</h3>
            
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>
                Forrás raktárhely <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select 
                value={issueLocation} 
                onChange={e => setIssueLocation(e.target.value)} 
                required 
                style={{
                  width: '100%', padding: '10px', backgroundColor: '#0f172a', 
                  border: !issueLocation ? '1px solid #f87171' : '1px solid #334155',
                  color: '#f8fafc', borderRadius: '6px'
                }}
              >
                <option value="">Válasszon forrás raktárhelyet...</option>
                {locations.filter(l => !l.is_archived).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Kiadás indoka</label>
              <select value={issueReason} onChange={e => setIssueReason(e.target.value)} style={{ width: '100%', padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px' }}>
                <option value="Eladás">Eladás</option>
                <option value="Szerviz">Szerviz</option>
                <option value="Selejtezés">Selejtezés</option>
                <option value="Transfer">Raktárközi transzfer</option>
                <option value="Egyéb">Egyéb</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Vevő / Hivatkozás / Megjegyzés</label>
              <input type="text" value={issueRef} onChange={e => setIssueRef(e.target.value)} placeholder="pl. John Doe / Rendelésszám" style={{ width: '100%', padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px' }} />
            </div>

            <div style={{ marginTop: '20px', borderTop: '1px solid #1e293b', paddingTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '14px' }}>
                <span>Összes kiadandó:</span>
                <span style={{ fontWeight: 'bold' }}>{issueCart.reduce((a, c) => a + c.quantity, 0)} db</span>
              </div>
              
              <button 
                onClick={handleFinalizeIssue} 
                disabled={!isCartValid()}
                style={{
                  width: '100%', padding: '12px', 
                  backgroundColor: !isCartValid() ? '#1e293b' : '#ef4444',
                  color: !isCartValid() ? '#64748b' : 'white', 
                  border: 'none', borderRadius: '6px', fontWeight: 'bold', 
                  cursor: !isCartValid() ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.2s'
                }}
              >
                Kiadás véglegesítése
              </button>
              
              {!isCartValid() && (
                <small style={{ color: '#ef4444', fontSize: '11px', display: 'block', marginTop: '6px', textAlign: 'center' }}>
                  {issueCart.length === 0 
                    ? "Szkenneljen be legalább 1 terméket a kiadáshoz!"
                    : !issueLocation 
                      ? "Válassza ki a forrás raktárhelyet!"
                      : "Készlet túllépés történt nem engedélyezett negatív készletű tételnél!"
                  }
                </small>
              )}
            </div>
          </div>

          {/* Help Panel */}
          <div className="glass-panel" style={{ padding: '16px', backgroundColor: 'rgba(30,41,59,0.3)', border: '1px dashed #1e293b' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', color: '#f87171' }}>
              <Info size={16} />
              <strong style={{ fontSize: '13px' }}>Útmutató a kiadáshoz</strong>
            </div>
            <ol style={{ paddingLeft: '16px', margin: 0, fontSize: '12px', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <li>Olvassa be a kiadandó termék vonalkódját a felső mezőben.</li>
              <li>A tételek listájában ellenőrizze a mennyiséget és az elérhető raktárkészletet.</li>
              <li>Válassza ki a forrás raktárhelyet, indokot, majd véglegesítse a kiadást.</li>
            </ol>
          </div>

        </div>
      </div>
    </div>
  );
}
