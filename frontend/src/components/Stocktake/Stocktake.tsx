import React, { useState, useEffect, useRef } from 'react';
import { Play, FileSpreadsheet, X, AlertTriangle, Scan, CheckCircle, ArrowLeft, Plus, Minus, Edit, History, AlertCircle } from 'lucide-react';
import confetti from 'canvas-confetti';
import { API_BASE } from '../../config';

const formatHUF = (value: number) => {
  return new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(value);
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('hu-HU');
};

interface StocktakeProps {
  token: string | null;
  stocktakes: any[];
  activeStocktake: any;
  setActiveStocktake: (st: any) => void;
  stocktakeItems: any[];
  setStocktakeItems: React.Dispatch<React.SetStateAction<any[]>>;
  products: any[];
  fetchData: () => void;
  playBeep: (freq?: number, duration?: number, volume?: number) => void;
}

export default function Stocktake({
  token, stocktakes, activeStocktake, setActiveStocktake,
  stocktakeItems, setStocktakeItems, products, fetchData, playBeep
}: StocktakeProps) {

  const [stocktakeName, setStocktakeName] = useState('');
  const [stocktakeNotes, setStocktakeNotes] = useState('');
  const [discrepancyFilter, setDiscrepancyFilter] = useState('all');
  const [showApplyCorrectionDialog, setShowApplyCorrectionDialog] = useState(false);
  const [correctionReason, setCorrectionReason] = useState('Leltár eltérés jóváhagyása');
  const [correctionConfirmed, setCorrectionConfirmed] = useState(false);

  // Scanner and Scan UX States
  const [scanInput, setScanInput] = useState('');
  const [lastScanned, setLastScanned] = useState<any>(null);
  const [scanHistory, setScanHistory] = useState<any[]>([]);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'warn' | 'info' } | null>(null);

  // Unresolved scans state
  const [unresolvedScans, setUnresolvedScans] = useState<any[]>([]);
  const [selectedScanToLink, setSelectedScanToLink] = useState<any>(null);
  const [linkProductId, setLinkProductId] = useState('');

  const scannerInputRef = useRef<HTMLInputElement>(null);
  const unresolvedRef = useRef<HTMLDivElement>(null);

  // Fetch unresolved scans when stocktake opens
  const fetchUnresolved = async () => {
    if (!activeStocktake) return;
    try {
      const response = await fetch(`${API_BASE}/stocktakes/${activeStocktake.id}/unresolved`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setUnresolvedScans(await response.json());
      }
    } catch (err) {
      console.error("Hiba az ismeretlen kódok lekérésekor");
    }
  };

  useEffect(() => {
    if (activeStocktake) {
      fetchUnresolved();
      // Auto focus scanner input
      setTimeout(() => {
        scannerInputRef.current?.focus();
      }, 300);
    }
  }, [activeStocktake]);

  // Flash message handler
  const showFeedback = (text: string, type: 'success' | 'warn' | 'info') => {
    setFeedbackMsg({ text, type });
    const timer = setTimeout(() => setFeedbackMsg(null), 3000);
    return () => clearTimeout(timer);
  };

  const handleCreateStocktake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stocktakeName.trim()) return;
    try {
      const response = await fetch(`${API_BASE}/stocktakes?name=${encodeURIComponent(stocktakeName)}&notes=${encodeURIComponent(stocktakeNotes)}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        await fetch(`${API_BASE}/stocktakes/${data.id}/start`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        alert("Új leltár sikeresen elindítva!");
        setStocktakeName('');
        setStocktakeNotes('');
        fetchData();
        // Automatically open the newly created stocktake
        handleOpenStocktake(data);
      }
    } catch (err) {
      alert("Hiba leltár indításakor");
    }
  };

  const handleOpenStocktake = async (st: any) => {
    setActiveStocktake(st);
    try {
      const response = await fetch(`${API_BASE}/stocktakes/${st.id}/discrepancies`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setStocktakeItems(await response.json());
      }
    } catch (err) {
      console.error("Hiba");
    }
  };

  const handleDeleteStocktake = async (stId: string) => {
    if (!confirm("Biztosan törölni szeretné ezt a leltárt? Ezzel minden leltározott adat és beolvasás véglegesen elvész!")) return;
    try {
      const response = await fetch(`${API_BASE}/stocktakes/${stId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        alert("Leltár sikeresen törölve.");
        fetchData();
      } else {
        const err = await response.json();
        alert(`Hiba: ${err.detail}`);
      }
    } catch (err) {
      alert("Hálózati hiba");
    }
  };

  const handleApplyCorrections = async () => {
    if (!correctionConfirmed) {
      alert("Kérjük, igazolja vissza a megerősítő mező bepipálásával!");
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/stocktakes/${activeStocktake.id}/apply-corrections?reason=${encodeURIComponent(correctionReason)}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        confetti();
        setShowApplyCorrectionDialog(false);
        setActiveStocktake(null);
        alert("A készleteltérések sikeresen korrigálásra kerültek!");
        fetchData();
      } else {
        const err = await response.json();
        alert(`Hiba történt a korrekciók végrehajtásakor: ${err.detail}`);
      }
    } catch (err) {
      alert("Hálózati hiba");
    }
  };

  const handleLinkScan = async (unresolvedId: string) => {
    if (!linkProductId) return;
    try {
      const response = await fetch(`${API_BASE}/stocktakes/unresolved/${unresolvedId}/link?product_id=${linkProductId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        alert("Vonalkód sikeresen összekapcsolva!");
        setSelectedScanToLink(null);
        setLinkProductId('');
        fetchUnresolved();
        handleOpenStocktake(activeStocktake);
      } else {
        const err = await response.json();
        alert(`Hiba: ${err.detail}`);
      }
    } catch (err) {
      alert("Hálózati hiba");
    }
  };

  const handleIgnoreScan = async (unresolvedId: string) => {
    try {
      const response = await fetch(`${API_BASE}/stocktakes/unresolved/${unresolvedId}/ignore?reason=Mellőzve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        alert("A tétel sikeresen mellőzve.");
        fetchUnresolved();
      }
    } catch (err) {
      alert("Hiba");
    }
  };

  // Dedicated scanner input handlers
  const submitBarcode = async (barcode: string) => {
    if (!barcode) return;
    try {
      const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
      const response = await fetch(`${API_BASE}/stocktakes/${activeStocktake.id}/scan`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ barcode })
      });
      const data = await response.json();
      
      if (data.status === 'success') {
        playBeep(1200, 0.15);
        showFeedback(`Beolvasva: ${barcode}`, 'success');
        
        // Find product locally
        const product = stocktakeItems.find(i => i.barcode === barcode || i.ean === barcode);
        if (product) {
          const prevCount = product.counted;
          const newCount = prevCount + 1;
          
          setStocktakeItems(prev => prev.map(i => 
            i.id === product.id ? { ...i, counted: newCount, difference: newCount - i.expected } : i
          ));
          
          const updatedProduct = { ...product, counted: newCount, difference: newCount - product.expected };
          setLastScanned(updatedProduct);
          setScanHistory(prev => [{ barcode, name: product.name, timestamp: new Date(), status: 'success' }, ...prev.slice(0, 4)]);
        }
      } else if (data.status === 'unknown') {
        playBeep(400, 0.3);
        showFeedback(`Ismeretlen vonalkód: ${barcode}`, 'warn');
        setScanHistory(prev => [{ barcode, name: 'Ismeretlen termék', timestamp: new Date(), status: 'unknown' }, ...prev.slice(0, 4)]);
        fetchUnresolved();
      } else {
        playBeep(400, 0.3);
        showFeedback(`Beolvasási hiba`, 'warn');
      }
    } catch (err) {
      console.error("Leltár szkennelés hiba", err);
    }
  };

  const handleScannerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanInput.trim()) return;
    const barcode = scanInput.trim();
    setScanInput('');
    await submitBarcode(barcode);
  };

  // Auto-submit scanned barcodes
  useEffect(() => {
    if (!activeStocktake || !scanInput.trim()) return;

    const query = scanInput.trim();
    // Auto-submit immediately if input is exactly 6 digits
    if (query.length === 6 && /^\d+$/.test(query)) {
      setScanInput('');
      submitBarcode(query);
    }
  }, [scanInput, products, activeStocktake]);

  // Adjust counted stock from the last scanned card
  const adjustLastScannedCount = (delta: number) => {
    if (!lastScanned) return;
    const targetVal = Math.max(0, lastScanned.counted + delta);
    updateProductCount(lastScanned.id, targetVal);
  };

  const updateProductCount = (itemId: string, val: number) => {
    setStocktakeItems(prev => prev.map(i => {
      if (i.id === itemId) {
        const updated = { ...i, counted: val, difference: val - i.expected };
        if (lastScanned && lastScanned.id === itemId) {
          setLastScanned(updated);
        }
        return updated;
      }
      return i;
    }));
  };

  const undoLastScan = () => {
    if (!lastScanned) return;
    adjustLastScannedCount(-1);
    showFeedback("Utolsó beolvasás visszavonva", "info");
  };

  const scrollToUnresolved = () => {
    unresolvedRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Progress stats calculation
  const totalItems = stocktakeItems.length;
  const countedItems = stocktakeItems.filter(i => i.counted > 0).length;
  const discrepancyCount = stocktakeItems.filter(i => i.difference !== 0).length;
  const notCountedCount = stocktakeItems.filter(i => i.counted === 0).length;

  return (
    <div>
      {/* Feedback Messages */}
      {feedbackMsg && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', zIndex: 1000,
          backgroundColor: feedbackMsg.type === 'success' ? '#15803d' : feedbackMsg.type === 'warn' ? '#b91c1c' : '#1e293b',
          color: 'white', padding: '12px 24px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold',
          animation: 'slideIn 0.3s ease-out'
        }}>
          {feedbackMsg.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
          {feedbackMsg.text}
        </div>
      )}

      {!activeStocktake ? (
        <div>
          <h1 style={{ fontSize: '24px', margin: '0 0 20px 0' }}>Leltár</h1>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
            
            {/* Create Stocktake panel */}
            <form onSubmit={handleCreateStocktake} className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ margin: 0 }}>Új leltár elindítása</h3>
              
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Leltár elnevezése</label>
                <input type="text" value={stocktakeName} onChange={e => setStocktakeName(e.target.value)} placeholder="pl. 2026 Féléves Leltár" required style={{ width: '100%', padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Megjegyzés</label>
                <textarea value={stocktakeNotes} onChange={e => setStocktakeNotes(e.target.value)} rows={3} style={{ width: '100%', padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} />
              </div>

              <button type="submit" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                <Play size={16} /> Leltár indítása
              </button>
            </form>

            {/* Existing Stocktakes List */}
            <div className="glass-panel" style={{ padding: '20px' }}>
              <h3 style={{ margin: '0 0 16px 0' }}>Korábbi leltárak</h3>
              <div className="table-container">
                <table className="dense-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Dátum</th>
                      <th>Leltár megnevezés</th>
                      <th>Státusz</th>
                      <th>Művelet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stocktakes.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', color: '#64748b' }}>Nincs korábbi leltár.</td>
                      </tr>
                    ) : (
                      stocktakes.map(st => (
                        <tr key={st.id}>
                          <td>{formatDate(st.created_at)}</td>
                          <td style={{ fontWeight: 'bold' }}>{st.name}</td>
                          <td>
                            <span className={st.status === 'Javítás alkalmazva' ? 'badge badge-success' : 'badge badge-warning'}>
                              {st.status}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button onClick={() => handleOpenStocktake(st)} style={{ backgroundColor: '#1e293b', border: '1px solid #334155', padding: '6px 12px', color: '#38bdf8', borderRadius: '4px', cursor: 'pointer' }}>
                                Munkalap megnyitása
                              </button>
                              {st.status !== 'Javítás alkalmazva' && (
                                <button 
                                  onClick={() => handleDeleteStocktake(st.id)} 
                                  style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: 'none', padding: '6px 12px', color: '#ef4444', borderRadius: '4px', cursor: 'pointer' }}
                                >
                                  Törlés
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ACTIVE STOCKTAKE WORKSPACE */
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <button onClick={() => setActiveStocktake(null)} style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', marginBottom: '8px' }}>
                <ArrowLeft size={16} /> Vissza a leltár listához
              </button>
              <h1 style={{ fontSize: '24px', margin: 0 }}>Leltár: {activeStocktake.name}</h1>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <a href={`https://inventory.ntsexp.site/api/excel/export/stocktake/${activeStocktake.id}`} className="badge badge-success" style={{ textDecoration: 'none', padding: '10px 16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <FileSpreadsheet size={16} /> Excel export
              </a>
              {activeStocktake.status !== 'Javítás alkalmazva' && (
                <div>
                  <button 
                    disabled={totalItems === 0 || unresolvedScans.length > 0}
                    onClick={() => setShowApplyCorrectionDialog(true)} 
                    style={{
                      padding: '10px 16px', 
                      backgroundColor: (totalItems === 0 || unresolvedScans.length > 0) ? '#1e293b' : '#d97706', 
                      color: (totalItems === 0 || unresolvedScans.length > 0) ? '#64748b' : 'white', 
                      border: 'none', borderRadius: '6px', fontWeight: 'bold', 
                      cursor: (totalItems === 0 || unresolvedScans.length > 0) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Eltérések javításának alkalmazása
                  </button>
                  
                  {unresolvedScans.length > 0 && (
                    <small style={{ color: '#ef4444', fontSize: '11px', display: 'block', marginTop: '4px', textAlign: 'right' }}>
                      Oldja fel az ismeretlen vonalkódokat a javítás előtt!
                    </small>
                  )}
                  {totalItems === 0 && (
                    <small style={{ color: '#ef4444', fontSize: '11px', display: 'block', marginTop: '4px', textAlign: 'right' }}>
                      Nincs leltározható termék a listában!
                    </small>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ACTIVE STOCKTAKE TOP PANEL: SCANNER WORKFLOW */}
          {activeStocktake.status !== 'Javítás alkalmazva' && (
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', marginBottom: '24px' }}>
              
              {/* Scanner input card */}
              <div 
                onClick={() => scannerInputRef.current?.focus()}
                className="glass-panel" 
                style={{
                  padding: '24px', border: '1px solid #38bdf8', cursor: 'text',
                  display: 'flex', flexDirection: 'column', gap: '12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Scan size={24} style={{ color: '#38bdf8', animation: 'pulse 2s infinite' }} />
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px' }}>Vonalkód beolvasása</h3>
                    <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                      Kattintson ide, majd olvassa be a terméket. Minden beolvasás 1 darabbal növeli a számolt leltárt.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleScannerSubmit} style={{ marginTop: '8px' }}>
                  <input
                    ref={scannerInputRef}
                    type="text"
                    value={scanInput}
                    onChange={e => setScanInput(e.target.value)}
                    placeholder="Szkenneljen be egy vonalkódot..."
                    style={{
                      width: '100%', padding: '12px 16px', backgroundColor: '#090d16',
                      border: '1px solid #1e293b', color: '#f8fafc', borderRadius: '8px', fontSize: '15px',
                      boxSizing: 'border-box'
                    }}
                  />
                </form>

                {/* Show Unresolved Link if exists */}
                {unresolvedScans.length > 0 && (
                  <div 
                    onClick={(e) => { e.stopPropagation(); scrollToUnresolved(); }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#eab308', fontSize: '13px', cursor: 'pointer', marginTop: '6px', textDecoration: 'underline' }}
                  >
                    <AlertCircle size={14} />
                    <span>{unresolvedScans.length} db ismeretlen leolvasás vár feloldásra. Kattintson ide az ugráshoz!</span>
                  </div>
                )}
              </div>

              {/* Scan History list */}
              <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <strong style={{ fontSize: '13px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <History size={14} /> Beolvasási előzmények (utolsó 5)
                </strong>
                {scanHistory.length === 0 ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#475569' }}>
                    Még nincs beolvasva tétel.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '120px', overflowY: 'auto' }}>
                    {scanHistory.map((h, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', paddingBottom: '4px', borderBottom: '1px solid #1e293b' }}>
                        <span style={{ color: h.status === 'success' ? '#22c55e' : '#ef4444', fontFamily: 'monospace' }}>{h.barcode}</span>
                        <span style={{ color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>{h.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ACTIVE STOCKTAKE LAST SCANNED LARGE UX CARD */}
          {lastScanned && activeStocktake.status !== 'Javítás alkalmazva' && (
            <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px', display: 'flex', gap: '24px', borderLeft: '6px solid #38bdf8', backgroundColor: 'rgba(56,189,248,0.03)' }}>
              
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 'bold', textTransform: 'uppercase' }}>Aktív / Legutóbbi Leltározott Termék</span>
                <h2 style={{ margin: '4px 0 8px 0', fontSize: '20px', color: '#f8fafc' }}>{lastScanned.name}</h2>
                <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: '#94a3b8' }}>
                  <span>Vonalkód: <strong style={{ color: '#38bdf8', fontFamily: 'monospace' }}>{lastScanned.barcode}</strong></span>
                  <span>SKU: <strong>{lastScanned.sku || '-'}</strong></span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '32px', marginTop: '16px' }}>
                  <div>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>Elvárt készlet:</span>
                    <div style={{ fontSize: '20px', color: '#cbd5e1', fontWeight: 'bold' }}>{lastScanned.expected} db</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>Számolt leltár:</span>
                    <div style={{ fontSize: '24px', color: '#38bdf8', fontWeight: 'bold' }}>{lastScanned.counted} db</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>Különbség:</span>
                    <div style={{ fontSize: '20px', color: lastScanned.difference === 0 ? '#cbd5e1' : lastScanned.difference < 0 ? '#ef4444' : '#22c55e', fontWeight: 'bold' }}>
                      {lastScanned.difference > 0 ? `+${lastScanned.difference}` : lastScanned.difference} db
                    </div>
                  </div>
                </div>
              </div>

              {/* Adjustments buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '10px', borderLeft: '1px solid #1e293b', paddingLeft: '24px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => adjustLastScannedCount(1)} style={{ padding: '8px 12px', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Plus size={14} /> +1
                  </button>
                  <button onClick={() => adjustLastScannedCount(-1)} style={{ padding: '8px 12px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#cbd5e1', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Minus size={14} /> -1
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => adjustLastScannedCount(5)} style={{ padding: '8px 12px', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Plus size={14} /> +5
                  </button>
                  <button onClick={() => adjustLastScannedCount(-5)} style={{ padding: '8px 12px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#cbd5e1', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Minus size={14} /> -5
                  </button>
                </div>
                <button 
                  onClick={() => {
                    const val = prompt("Adja meg a számolt leltározott mennyiséget:", lastScanned.counted.toString());
                    if (val !== null) {
                      updateProductCount(lastScanned.id, Math.max(0, Number(val) || 0));
                    }
                  }}
                  style={{ padding: '8px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#cbd5e1', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                >
                  <Edit size={14} /> Pontos darabszám...
                </button>
                <button onClick={undoLastScan} style={{ padding: '8px', backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                  Utoljára beolvasás visszavonása
                </button>
              </div>

            </div>
          )}

          {/* Apply Corrections confirmation dialog */}
          {showApplyCorrectionDialog && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
              <div className="glass-panel" style={{ padding: '32px', width: '500px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, color: '#f59e0b' }}>Leltárkorrekció végrehajtása</h3>
                  <button onClick={() => setShowApplyCorrectionDialog(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={20} /></button>
                </div>
                <p style={{ fontSize: '14px', color: '#cbd5e1', margin: 0 }}>
                  Biztosan alkalmazni szeretné a mért eltéréseket a készletre? Ez a művelet módosítani fogja a termékek aktuális készletét az adatbázisban a számolt mennyiségekre!
                </p>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>Megerősítő indoklás</label>
                  <input type="text" value={correctionReason} onChange={e => setCorrectionReason(e.target.value)} required style={{ width: '100%', padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} />
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '14px' }}>
                  <input type="checkbox" checked={correctionConfirmed} onChange={e => setCorrectionConfirmed(e.target.checked)} style={{ width: '18px', height: '18px' }} />
                  Kijelentem, hogy átnéztem a leltározási eltéréseket
                </label>

                <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                  <button onClick={() => setShowApplyCorrectionDialog(false)} style={{ flex: 1, padding: '12px', backgroundColor: '#1e293b', border: '1px solid #334155', color: 'white', borderRadius: '6px', cursor: 'pointer' }}>Mégse</button>
                  <button onClick={handleApplyCorrections} style={{ flex: 1, padding: '12px', backgroundColor: '#d97706', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Korrekció futtatása</button>
                </div>
              </div>
            </div>
          )}

          {/* Leltár stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div className="glass-panel" style={{ padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Counted / Progress</div>
              <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#38bdf8', marginTop: '4px' }}>
                {countedItems} / {totalItems}
              </div>
              <small style={{ fontSize: '11px', color: '#64748b' }}>Termékek leltározva ({((countedItems/totalItems)*100 || 0).toFixed(0)}%)</small>
            </div>
            <div className="glass-panel" style={{ padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Eltérések száma</div>
              <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#f59e0b', marginTop: '4px' }}>
                {discrepancyCount} db
              </div>
              <small style={{ fontSize: '11px', color: '#64748b' }}>Készlet eltérések darabszáma</small>
            </div>
            <div className="glass-panel" style={{ padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Nem leltározott termékek</div>
              <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#cbd5e1', marginTop: '4px' }}>
                {notCountedCount} db
              </div>
              <small style={{ fontSize: '11px', color: '#64748b' }}>Még beolvasásra vár</small>
            </div>
            <div className="glass-panel" style={{ padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Beszerzési érték különbség</div>
              <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#ef4444', marginTop: '4px' }}>
                {formatHUF(stocktakeItems.reduce((acc, curr) => acc + (curr.difference * curr.purchase_price_net), 0))}
              </div>
              <small style={{ fontSize: '11px', color: '#64748b' }}>Hiányzó / többlet árak összesítve</small>
            </div>
          </div>

          {/* UNRESOLVED UNKNOWN BARCODES PANEL */}
          <div ref={unresolvedRef}>
            {unresolvedScans.length > 0 && (
              <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px', border: '1px solid #eab308' }}>
                <h3 style={{ margin: '0 0 12px 0', color: '#eab308', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle size={18} /> Ismeretlen Beolvasott Vonalkódok ({unresolvedScans.length} db)
                </h3>
                
                <div className="table-container">
                  <table className="dense-table">
                    <thead>
                      <tr>
                        <th>Beolvasási Idő</th>
                        <th>Szkennelt vonalkód</th>
                        <th>Művelet</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unresolvedScans.map(scan => (
                        <tr key={scan.id}>
                          <td>{formatDate(scan.timestamp)}</td>
                          <td style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{scan.barcode}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button onClick={() => setSelectedScanToLink(scan)} style={{ padding: '6px 12px', backgroundColor: '#0284c7', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer' }}>Összekapcsolás meglévő termékkel</button>
                              <button onClick={() => handleIgnoreScan(scan.id)} style={{ padding: '6px 12px', backgroundColor: '#334155', border: '1px solid #475569', color: '#f8fafc', borderRadius: '4px', cursor: 'pointer' }}>Mellőzés</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Link Modal Overlay */}
          {selectedScanToLink && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
              <div className="glass-panel" style={{ padding: '24px', width: '450px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>Vonalkód összekapcsolása</h3>
                  <button onClick={() => setSelectedScanToLink(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={20} /></button>
                </div>
                <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
                  Válassza ki a terméket, amelyhez a <b>{selectedScanToLink.barcode}</b> vonalkódot hozzá szeretné rendelni a leltárban.
                </p>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>Termék kiválasztása</label>
                  <select value={linkProductId} onChange={e => setLinkProductId(e.target.value)} style={{ width: '100%', padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px' }}>
                    <option value="">Válasszon terméket...</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.sku || 'Nincs SKU'})</option>
                    ))}
                  </select>
                </div>

                <button onClick={() => handleLinkScan(selectedScanToLink.id)} disabled={!linkProductId} style={{ width: '100%', padding: '12px', backgroundColor: '#22c55e', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                  Kapcsolat mentése
                </button>
              </div>
            </div>
          )}

          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            {[
              { id: 'all', label: 'Minden tétel' },
              { id: 'diff', label: 'Eltérések' },
              { id: 'missing', label: 'Hiányok' },
              { id: 'surplus', label: 'Többletek' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setDiscrepancyFilter(f.id)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: discrepancyFilter === f.id ? '#38bdf8' : '#1e293b',
                  color: discrepancyFilter === f.id ? '#090d16' : '#cbd5e1',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Items discrepancy review table */}
          <div className="table-container">
            <table className="dense-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Vonalkód</th>
                  <th>Cikkszám (SKU)</th>
                  <th>Termék név</th>
                  <th>Elvárt készlet</th>
                  <th>Számolt leltár</th>
                  <th>Eltérés</th>
                  <th>Egység beszerzési ár (Ft)</th>
                  <th>Pénzügyi hatás (Ft)</th>
                </tr>
              </thead>
              <tbody>
                {stocktakeItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', color: '#64748b', padding: '24px' }}>
                      Nincsenek termékek a leltár munkalapon.
                    </td>
                  </tr>
                ) : (
                  stocktakeItems
                    .filter(item => {
                      if (discrepancyFilter === 'diff') return item.difference !== 0;
                      if (discrepancyFilter === 'missing') return item.difference < 0;
                      if (discrepancyFilter === 'surplus') return item.difference > 0;
                      return true;
                    })
                    .map(item => (
                      <tr key={item.id}>
                        <td style={{ fontFamily: 'monospace', color: '#38bdf8' }}>{item.barcode}</td>
                        <td>{item.sku || '-'}</td>
                        <td style={{ fontWeight: '500' }}>{item.name}</td>
                        <td>{item.expected} db</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input 
                              type="number" 
                              min="0"
                              value={item.counted} 
                              disabled={activeStocktake.status === 'Javítás alkalmazva'}
                              onChange={e => {
                                const val = Math.max(0, Number(e.target.value) || 0);
                                updateProductCount(item.id, val);
                              }}
                              style={{ width: '80px', padding: '4px', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '4px', textAlign: 'center' }} 
                            />
                          </div>
                        </td>
                        <td style={{ color: item.difference === 0 ? '#cbd5e1' : item.difference < 0 ? '#ef4444' : '#22c55e', fontWeight: 'bold' }}>
                          {item.difference > 0 ? `+${item.difference}` : item.difference} db
                        </td>
                        <td>{formatHUF(item.purchase_price_net)}</td>
                        <td style={{ fontWeight: 'bold', color: item.difference === 0 ? '#cbd5e1' : item.difference < 0 ? '#ef4444' : '#22c55e' }}>
                          {formatHUF(item.difference * item.purchase_price_net)}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
