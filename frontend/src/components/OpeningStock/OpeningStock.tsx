import React, { useState, useEffect, useRef } from 'react';
import { Trash2, Scan, CheckCircle, Info, Download, Upload, AlertCircle, Search } from 'lucide-react';
import confetti from 'canvas-confetti';
import { API_BASE } from '../../config';

interface OpeningStockProps {
  token: string | null;
  locations: any[];
  fetchData: () => void;
  products: any[];
  playBeep: (freq?: number, duration?: number, volume?: number) => void;
  cart: any[];
  setCart: React.Dispatch<React.SetStateAction<any[]>>;
  manualLocation: string;
  setManualLocation: React.Dispatch<React.SetStateAction<string>>;
}

export default function OpeningStock({
  token, locations, fetchData, products, playBeep,
  cart, setCart, manualLocation, setManualLocation
}: OpeningStockProps) {
  
  const [activeSubTab, setActiveSubTab] = useState<'manual' | 'excel'>('manual');
  
  const [scanInput, setScanInput] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'warn' | 'info' } | null>(null);
  
  // Excel Import state
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [managerConfirm, setManagerConfirm] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-select first location on mount
  useEffect(() => {
    if (locations.length > 0 && !manualLocation) {
      setManualLocation(locations[0].id);
    }
  }, [locations, manualLocation]);

  // Focus scanner input on mount/tab change
  useEffect(() => {
    if (activeSubTab === 'manual' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [activeSubTab]);

  const showFeedback = (text: string, type: 'success' | 'warn' | 'info') => {
    setFeedbackMsg({ text, type });
    const timer = setTimeout(() => setFeedbackMsg(null), 3000);
    return () => clearTimeout(timer);
  };

  // Search/Scan barcode logic
  useEffect(() => {
    if (activeSubTab !== 'manual') return;
    if (!scanInput.trim()) {
      setSearchResults([]);
      return;
    }

    const query = scanInput.toLowerCase().trim();

    // Direct match for exact 6 digit scanner code
    if (query.length === 6 && /^\d+$/.test(query)) {
      const match = products.find(p => p.barcode.toLowerCase() === query);
      if (match) {
        addToCart(match);
      } else {
        playBeep(400, 0.3);
        showFeedback(`Ismeretlen vonalkód: ${scanInput}`, "warn");
      }
      setScanInput('');
      return;
    }

    const fuzzyMatchWord = (text: string, queryWord: string): boolean => {
      const t = text.toLowerCase();
      const q = queryWord.toLowerCase();
      let qIdx = 0;
      let lastMatchIdx = -1;
      for (let i = 0; i < t.length; i++) {
        if (t[i] === q[qIdx]) {
          if (qIdx > 0 && i - lastMatchIdx > 7) {
            continue;
          }
          lastMatchIdx = i;
          qIdx++;
          if (qIdx === q.length) return true;
        }
      }
      return false;
    };

    const words = query.split(/\s+/);
    const filtered = products.filter(p => {
      return words.every(word => {
        const fields = [
          p.name || '',
          p.barcode || '',
          p.sku || ''
        ];
        return fields.some(field => fuzzyMatchWord(field, word));
      });
    }).slice(0, 5);

    setSearchResults(filtered);
  }, [scanInput, products, activeSubTab]);

  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanInput.trim()) return;

    // Check if there is an exact match in current products list
    const query = scanInput.trim().toLowerCase();
    const match = products.find(p => 
      p.barcode.toLowerCase() === query || 
      (p.ean && p.ean.toLowerCase() === query) ||
      (p.sku && p.sku.toLowerCase() === query)
    );

    if (match) {
      addToCart(match);
      setScanInput('');
      setSearchResults([]);
    } else {
      // Barcode not found
      playBeep(400, 0.3);
      showFeedback(`Ismeretlen vonalkód: ${scanInput}`, "warn");
      setScanInput('');
      setSearchResults([]);
    }
  };

  const addToCart = (product: any) => {
    if (!manualLocation) {
      alert("Kérjük, először válasszon tárhelyet!");
      return;
    }
    
    setCart(prev => {
      const existing = prev.find(item => item.product_id === product.id && item.location_id === manualLocation);
      if (existing) {
        showFeedback(`Mennyiség növelve: ${product.name}`, 'success');
        return prev.map(item => 
          (item.product_id === product.id && item.location_id === manualLocation)
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      playBeep(880, 0.1);
      showFeedback(`Hozzáadva: ${product.name}`, 'success');
      return [...prev, {
        product_id: product.id,
        name: product.name,
        barcode: product.barcode,
        sku: product.sku,
        location_id: manualLocation,
        location_name: locations.find(l => l.id === manualLocation)?.name || '',
        quantity: 1
      }];
    });
  };

  const handleRemoveItem = (prodId: string, locId: string) => {
    setCart(prev => prev.filter(item => !(item.product_id === prodId && item.location_id === locId)));
  };

  const handleQtyChange = (prodId: string, locId: string, val: string) => {
    const num = parseInt(val) || 0;
    setCart(prev => prev.map(item => 
      (item.product_id === prodId && item.location_id === locId)
        ? { ...item, quantity: Math.max(0, num) }
        : item
    ));
  };

  // Submit manual opening stock
  const handleSaveManual = async () => {
    if (cart.length === 0) return;
    
    setImporting(true);
    try {
      // Check movements first to alert user
      const productIds = cart.map(item => item.product_id);
      const checkResp = await fetch(`${API_BASE}/inventory/opening-stock/check-movements`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ product_ids: productIds })
      });
      
      let hasExisting = false;
      if (checkResp.ok) {
        const counts = await checkResp.json();
        hasExisting = Object.values(counts).some(v => v === true);
      }
      
      if (hasExisting && !managerConfirm) {
        // Warn user
        alert("Figyelem! Egyes termékek már rendelkeznek készletmozgással. A rögzítéshez pipálja be a vezetői megerősítés jelölőnégyzetet!");
        setImporting(false);
        return;
      }

      const response = await fetch(`${API_BASE}/inventory/opening-stock`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          items: cart.map(item => ({
            product_id: item.product_id,
            quantity: item.quantity,
            location_id: item.location_id
          })),
          force_apply: managerConfirm,
          note: "Kézi nyitókészlet rögzítés"
        })
      });

      if (response.ok) {
        confetti();
        playBeep(1200, 0.2);
        alert("A nyitókészlet sikeresen elmentve!");
        setCart([]);
        setManagerConfirm(false);
        fetchData();
      } else {
        const err = await response.json();
        alert(`Hiba a mentés során: ${err.detail?.message || err.detail}`);
      }
    } catch (err) {
      alert("Hálózati hiba a mentés során.");
    } finally {
      setImporting(false);
    }
  };

  // Excel template download
  const handleDownloadTemplate = () => {
    window.open(`${API_BASE}/inventory/opening-stock/template?token=${token}`, '_blank');
  };

  // Excel file select & parse preview
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setExcelFile(e.target.files[0]);
      setImportPreview(null);
    }
  };

  const handleUploadPreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!excelFile) return;

    setPreviewLoading(true);
    setImportPreview(null);
    const formData = new FormData();
    formData.append('file', excelFile);

    try {
      const response = await fetch(`${API_BASE}/inventory/opening-stock/import-preview`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      if (response.ok) {
        const data = await response.json();
        setImportPreview(data);
        playBeep(1000, 0.15);
      } else {
        const err = await response.json();
        alert(`Sikertelen betöltés: ${err.detail}`);
      }
    } catch (err) {
      alert("Hálózati hiba.");
    } finally {
      setPreviewLoading(false);
    }
  };

  // Excel submit opening stock
  const handleApplyExcel = async () => {
    if (!importPreview || importPreview.items.length === 0) return;
    
    // Check if there are invalid rows
    const validItems = importPreview.items.filter((item: any) => item.is_valid);
    if (validItems.length === 0) {
      alert("Nincsenek érvényes sorok a fájlban!");
      return;
    }

    setImporting(true);
    try {
      const response = await fetch(`${API_BASE}/inventory/opening-stock`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          items: validItems.map((item: any) => ({
            product_id: item.product_id,
            quantity: item.quantity,
            location_id: item.location_id
          })),
          force_apply: managerConfirm,
          note: `Importálva Excelből: ${excelFile?.name}`
        })
      });

      if (response.ok) {
        confetti();
        playBeep(1200, 0.25);
        alert("Az Excel nyitókészlet sikeresen betöltve!");
        setExcelFile(null);
        setImportPreview(null);
        setManagerConfirm(false);
        fetchData();
      } else {
        const err = await response.json();
        alert(`Hiba a betöltés során: ${err.detail?.message || err.detail}`);
      }
    } catch (err) {
      alert("Hálózati hiba.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="tab-pane active">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#f8fafc' }}>Nyitókészlet Rögzítése</h2>
          <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '14px' }}>
            Új termékek vagy a meglévő raktárkészletek induló egyenlegének rögzítése OPENING_BALANCE mozgástípussal.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #1e293b', marginBottom: '20px' }}>
        <button
          onClick={() => setActiveSubTab('manual')}
          style={{
            padding: '10px 16px',
            backgroundColor: 'transparent',
            border: 'none',
            borderBottom: activeSubTab === 'manual' ? '2px solid #0284c7' : '2px solid transparent',
            color: activeSubTab === 'manual' ? '#38bdf8' : '#94a3b8',
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Kézi rögzítés és Szkennelés
        </button>
        <button
          onClick={() => setActiveSubTab('excel')}
          style={{
            padding: '10px 16px',
            backgroundColor: 'transparent',
            border: 'none',
            borderBottom: activeSubTab === 'excel' ? '2px solid #0284c7' : '2px solid transparent',
            color: activeSubTab === 'excel' ? '#38bdf8' : '#94a3b8',
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Excel importálás
        </button>
      </div>

      {/* Subtab Contents */}
      {activeSubTab === 'manual' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Scanner & Search Input Container */}
          <div 
            onClick={() => inputRef.current?.focus()}
            className="glass-panel" 
            style={{
              padding: '24px', marginBottom: '4px', display: 'flex', flexDirection: 'column', gap: '12px',
              border: '1px solid #38bdf8', cursor: 'text', position: 'relative', zIndex: 10
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Scan size={24} style={{ color: '#38bdf8', animation: 'pulse 2s infinite' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#f8fafc' }}>
                  Kattintson ide, majd olvassa be a termék vonalkódját
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
              
              {/* Autocomplete Search Dropdown */}
              {searchResults.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#0f172a',
                  border: '1px solid #1e293b', borderRadius: '0 0 8px 8px', zIndex: 100, maxHeight: '250px',
                  overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
                }}>
                  {searchResults.map(p => (
                    <div
                      key={p.id}
                      onClick={() => {
                        addToCart(p);
                        setScanInput('');
                        setSearchResults([]);
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
                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>Vonalkód: {p.barcode} | SKU: {p.sku || '-'}</span>
                      </div>
                      <span className="badge badge-info">{p.current_stock} db készlet</span>
                    </div>
                  ))}
                </div>
              )}
            </form>
          </div>

          {/* Grid Layout for Cart & Sidebar */}
          <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '24px' }}>
            {/* Left Column: Cart Table */}
            <div className="table-container" style={{ alignSelf: 'start' }}>
              <table className="dense-table">
                <thead>
                  <tr>
                    <th>Belső kód</th>
                    <th>Cikkszám (SKU)</th>
                    <th>Termék név</th>
                    <th>Tárhely</th>
                    <th style={{ width: '140px' }}>Nyitó Mennyiség</th>
                    <th style={{ width: '80px', textAlign: 'center' }}>Eltávolítás</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: '#64748b', padding: '24px' }}>
                        Üres a rögzítési lista. Olvasson be termékeket vagy keresse ki őket fent.
                      </td>
                    </tr>
                  ) : (
                    cart.map(item => (
                      <tr key={`${item.product_id}-${item.location_id}`}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{item.barcode}</td>
                        <td>{item.sku || '-'}</td>
                        <td style={{ fontWeight: '500' }}>{item.name}</td>
                        <td>
                          <span className="badge badge-info">{item.location_name}</span>
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            value={item.quantity}
                            onChange={e => handleQtyChange(item.product_id, item.location_id, e.target.value)}
                            style={{ width: '100%', padding: '6px', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '4px', textAlign: 'right', boxSizing: 'border-box' }}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            onClick={() => handleRemoveItem(item.product_id, item.location_id)}
                            style={{ padding: '6px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444' }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Right Column: Details & Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="glass-panel" style={{ padding: '20px' }}>
                <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '16px', fontWeight: 'bold' }}>Részletek</h3>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#cbd5e1', marginBottom: '6px' }}>Cél Tárhely *</label>
                  <select
                    value={manualLocation}
                    onChange={e => setManualLocation(e.target.value)}
                    style={{ width: '100%', padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }}
                  >
                    {locations.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="glass-panel" style={{ padding: '20px' }}>
                <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '16px', fontWeight: 'bold' }}>Összegzés</h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: '#cbd5e1', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Elemek száma:</span>
                    <strong>{cart.length} db</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Össz. mennyiség:</span>
                    <strong>{cart.reduce((acc, curr) => acc + curr.quantity, 0)} db</strong>
                  </div>
                </div>

                {/* Manager confirmation check */}
                <div style={{ padding: '12px', backgroundColor: '#1e293b', borderRadius: '6px', marginBottom: '20px', border: '1px solid #334155' }}>
                  <label style={{ display: 'flex', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#cbd5e1' }}>
                    <input
                      type="checkbox"
                      checked={managerConfirm}
                      onChange={e => setManagerConfirm(e.target.checked)}
                      style={{ marginTop: '2px' }}
                    />
                    <span>Vezetői megerősítés (Már készletezett termékek felülírásához)</span>
                  </label>
                </div>

                <button
                  onClick={handleSaveManual}
                  disabled={cart.length === 0 || importing}
                  style={{
                    width: '100%',
                    padding: '12px',
                    backgroundColor: cart.length === 0 || importing ? '#1e293b' : '#0284c7',
                    color: cart.length === 0 || importing ? '#64748b' : 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 'bold',
                    cursor: cart.length === 0 || importing ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  {importing ? "Mentés..." : "Nyitókészlet Mentése"}
                </button>
              </div>
              
              {feedbackMsg && (
                <div className={`glass-panel`} style={{ padding: '12px', display: 'flex', gap: '8px', alignItems: 'center', borderLeft: feedbackMsg.type === 'success' ? '4px solid #22c55e' : '4px solid #f59e0b' }}>
                  <Info size={16} style={{ color: feedbackMsg.type === 'success' ? '#22c55e' : '#f59e0b' }} />
                  <span style={{ fontSize: '13px', color: '#cbd5e1' }}>{feedbackMsg.text}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Excel Import View */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>Excel sablon letöltése</h3>
              <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
                Töltse le a magyar nyelvű sablont a megfelelő oszlopok és példák áttekintéséhez.
              </p>
            </div>
            <button
              onClick={handleDownloadTemplate}
              style={{
                padding: '10px 16px',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                color: 'white',
                borderRadius: '6px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Download size={16} /> Sablon letöltése
            </button>
          </div>

          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '16px', fontWeight: 'bold' }}>Fájl feltöltése és Ellenőrzés</h3>
            <form onSubmit={handleUploadPreview} style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <input
                type="file"
                accept=".xlsx"
                onChange={handleFileChange}
                style={{
                  padding: '8px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  color: 'white',
                  borderRadius: '6px',
                  flex: 1
                }}
              />
              <button
                type="submit"
                disabled={!excelFile || previewLoading}
                style={{
                  padding: '10px 20px',
                  backgroundColor: !excelFile || previewLoading ? '#1e293b' : '#0284c7',
                  color: !excelFile || previewLoading ? '#64748b' : 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 'bold',
                  cursor: !excelFile || previewLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <Upload size={16} /> {previewLoading ? "Ellenőrzés..." : "Feltöltés és Előnézet"}
              </button>
            </form>
          </div>

          {/* Import Preview Rows List */}
          {importPreview && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="glass-panel" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>Előnézeti Eredmények</h3>
                  <div style={{ display: 'flex', gap: '16px', marginTop: '6px', fontSize: '13px' }}>
                    <span style={{ color: '#22c55e' }}>✔ Érvényes sorok: {importPreview.items.filter((i: any) => i.is_valid).length} db</span>
                    <span style={{ color: '#ef4444' }}>✖ Hibás sorok: {importPreview.items.filter((i: any) => !i.is_valid).length} db</span>
                    {importPreview.has_duplicates && (
                      <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>⚠ A fájlban duplikált vonalkódok találhatók!</span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <label style={{ display: 'flex', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#cbd5e1', backgroundColor: '#1e293b', padding: '8px 12px', borderRadius: '6px', border: '1px solid #334155' }}>
                    <input
                      type="checkbox"
                      checked={managerConfirm}
                      onChange={e => setManagerConfirm(e.target.checked)}
                    />
                    <span>Vezetői jóváhagyás engedélyezése</span>
                  </label>

                  <button
                    onClick={handleApplyExcel}
                    disabled={importing || importPreview.items.filter((i: any) => i.is_valid).length === 0}
                    style={{
                      padding: '12px 24px',
                      backgroundColor: importing || importPreview.items.filter((i: any) => i.is_valid).length === 0 ? '#1e293b' : '#22c55e',
                      color: importing || importPreview.items.filter((i: any) => i.is_valid).length === 0 ? '#64748b' : 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontWeight: 'bold',
                      cursor: importing || importPreview.items.filter((i: any) => i.is_valid).length === 0 ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {importing ? "Végrehajtás..." : "Nyitókészlet Alkalmazása"}
                  </button>
                </div>
              </div>

              <div className="table-container">
                <table className="dense-table">
                  <thead>
                    <tr>
                      <th style={{ width: '60px' }}>Sor</th>
                      <th>Belső vonalkód</th>
                      <th>Cikkszám (SKU)</th>
                      <th>Terméknév</th>
                      <th>Mennyiség</th>
                      <th>Tárhely (Név)</th>
                      <th>Státusz / Hiba</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.items.map((item: any, idx: number) => (
                      <tr key={idx} style={{ backgroundColor: item.is_valid ? 'transparent' : 'rgba(239, 68, 68, 0.05)' }}>
                        <td style={{ color: '#64748b', fontWeight: 'bold' }}>{item.row_index}</td>
                        <td style={{ fontFamily: 'monospace' }}>{item.barcode || '-'}</td>
                        <td>{item.sku || '-'}</td>
                        <td style={{ color: item.name ? 'white' : '#64748b' }}>{item.name || '(Hiányzik)'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{item.quantity} db</td>
                        <td>
                          {item.location_name ? (
                            <span className="badge badge-info">{item.location_name}</span>
                          ) : (
                            <span style={{ color: '#ef4444' }}>-</span>
                          )}
                        </td>
                        <td>
                          {item.is_valid ? (
                            <span style={{ color: '#22c55e', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <CheckCircle size={14} /> Érvényes
                            </span>
                          ) : (
                            <span style={{ color: '#ef4444', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              {item.errors.map((err: string, eIdx: number) => (
                                <span key={eIdx} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <AlertCircle size={12} /> {err}
                                </span>
                              ))}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
