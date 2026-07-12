import React, { useState, useEffect, useRef } from 'react';
import { Trash2, AlertTriangle, Scan, CheckCircle, Search, Info } from 'lucide-react';
import confetti from 'canvas-confetti';
import { API_BASE } from '../../config';

interface ReceiptProps {
  token: string | null;
  receiptCart: any[];
  setReceiptCart: React.Dispatch<React.SetStateAction<any[]>>;
  receiptLocation: string;
  setReceiptLocation: (val: string) => void;
  receiptRef: string;
  setReceiptRef: (val: string) => void;
  locations: any[];
  fetchData: () => void;
  products: any[];
  playBeep: (freq?: number, duration?: number, volume?: number) => void;
}

export default function Receipt({
  token, receiptCart, setReceiptCart, receiptLocation, setReceiptLocation,
  receiptRef, setReceiptRef, locations, fetchData, products, playBeep
}: ReceiptProps) {
  
  const [scanInput, setScanInput] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [lastScanned, setLastScanned] = useState<any>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'warn' | 'info' } | null>(null);
  
  // Dialogs
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [showLinkProduct, setShowLinkProduct] = useState(false);
  
  // Quick Create Form State
  const [quickName, setQuickName] = useState('');
  const [quickSku, setQuickSku] = useState('');
  const [quickPriceNet, setQuickPriceNet] = useState('0');
  const [quickPriceGross, setQuickPriceGross] = useState('0');
  const [quickSaleNet, setQuickSaleNet] = useState('0');
  const [quickSaleGross, setQuickSaleGross] = useState('0');
  
  // Link Product State
  const [linkSearch, setLinkSearch] = useState('');
  
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
        setUnknownBarcode(scanInput.trim());
      }
      setScanInput('');
      return;
    }

    // Otherwise, perform fuzzy search
    const filtered = products.filter(p => 
      p.name.toLowerCase().includes(query) ||
      p.barcode.toLowerCase().includes(query) ||
      (p.ean && p.ean.toLowerCase().includes(query)) ||
      (p.sku && p.sku.toLowerCase().includes(query))
    ).slice(0, 5);

    setSearchResults(filtered);
  }, [scanInput, products]);

  const addToCart = (product: any) => {
    setReceiptCart(prev => {
      const existing = prev.find(item => item.product_id === product.id);
      if (existing) {
        showFeedback(`Mennyiség növelve: ${product.name}`, 'success');
        playBeep(1200, 0.1);
        return prev.map(item => item.product_id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      showFeedback(`Termék hozzáadva: ${product.name}`, 'success');
      playBeep(1200, 0.15);
      return [...prev, {
        product_id: product.id,
        name: product.name,
        barcode: product.barcode,
        quantity: 1,
        price_net: product.purchase_price_net,
        original_price_net: product.purchase_price_net,
        current_stock: product.current_stock
      }];
    });
    setLastScanned(product);
  };

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
    } else {
      // Barcode not found
      playBeep(400, 0.3);
      showFeedback("Ismeretlen vonalkód", "warn");
      setUnknownBarcode(scanInput.trim());
      setScanInput('');
    }
  };

  const handleQuickCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickName.trim()) return;

    try {
      const response = await fetch(`${API_BASE}/products`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: quickName,
          barcode: unknownBarcode,
          sku: quickSku || null,
          purchase_price_net: parseInt(quickPriceNet) || 0,
          purchase_price_gross: parseInt(quickPriceGross) || 0,
          sale_price_net: parseInt(quickSaleNet) || 0,
          sale_price_gross: parseInt(quickSaleGross) || 0
        })
      });

      if (response.ok) {
        const newProduct = await response.json();
        // Hot reload master lists
        fetchData();
        // Add to cart
        addToCart(newProduct);
        // Reset and close
        setQuickName('');
        setQuickSku('');
        setQuickPriceNet('0');
        setQuickPriceGross('0');
        setQuickSaleNet('0');
        setQuickSaleGross('0');
        setShowQuickCreate(false);
        setUnknownBarcode(null);
      } else {
        const err = await response.json();
        alert(`Hiba: ${err.detail}`);
      }
    } catch (err) {
      alert("Hálózati hiba a mentés során.");
    }
  };

  const handleLinkProduct = async (product: any) => {
    if (!unknownBarcode) return;
    try {
      const response = await fetch(`${API_BASE}/products/${product.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: product.name,
          barcode: product.barcode,
          ean: unknownBarcode, // Link the unknown scanned code to EAN!
          sku: product.sku,
          purchase_price_net: product.purchase_price_net,
          purchase_price_gross: product.purchase_price_gross,
          sale_price_net: product.sale_price_net,
          sale_price_gross: product.sale_price_gross,
          category_id: product.category_id,
          supplier_id: product.supplier_id,
          default_location_id: product.default_location_id,
          unit: product.unit,
          vat_rate: product.vat_rate,
          minimum_stock: product.minimum_stock,
          track_stock: product.track_stock,
          allow_negative_stock: product.allow_negative_stock,
          serial_number_tracking: product.serial_number_tracking
        })
      });

      if (response.ok) {
        const updated = await response.json();
        fetchData();
        addToCart(updated);
        setShowLinkProduct(false);
        setUnknownBarcode(null);
      } else {
        const err = await response.json();
        alert(`Hiba: ${err.detail}`);
      }
    } catch (err) {
      alert("Hálózati hiba az összekapcsolás során.");
    }
  };

  const handleFinalizeReceipt = async () => {
    if (receiptCart.length === 0 || !receiptLocation) {
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/inventory/receipt`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          items: receiptCart.map(i => ({ product_id: i.product_id, quantity: i.quantity, purchase_price_net: i.price_net })),
          location_id: receiptLocation,
          reference_number: receiptRef
        })
      });
      if (response.ok) {
        confetti();
        setReceiptCart([]);
        setReceiptRef('');
        setLastScanned(null);
        showFeedback("Bevételezés sikeresen véglegesítve!", 'success');
        fetchData();
      } else {
        const err = await response.json();
        alert(`Hiba a bevételezés során: ${err.detail}`);
      }
    } catch (err) {
      alert("Hiba a mentés során");
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: '24px', margin: '0 0 20px 0' }}>Bevételezés</h1>

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
          border: '1px solid #0284c7', cursor: 'text', position: 'relative'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Scan size={24} style={{ color: '#0284c7', animation: 'pulse 2s infinite' }} />
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
                  <span style={{ fontSize: '12px', color: '#38bdf8', backgroundColor: 'rgba(56,189,248,0.1)', padding: '4px 8px', borderRadius: '4px' }}>
                    Készlet: {p.current_stock} db
                  </span>
                </div>
              ))}
            </div>
          )}
        </form>
      </div>

      {/* Main Grid: Items and Finalization */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '24px' }}>
        
        {/* Left Side: Receipt Cart items list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Last Scanned Product Details Card */}
          {lastScanned && (
            <div className="glass-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '16px', borderLeft: '4px solid #10b981', backgroundColor: 'rgba(16,185,129,0.05)' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '6px', backgroundColor: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
                OK
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 'bold', textTransform: 'uppercase' }}>Utoljára beolvasva</span>
                <strong style={{ display: 'block', fontSize: '16px', color: '#f8fafc' }}>{lastScanned.name}</strong>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>Vonalkód: {lastScanned.barcode} | Készlet: {lastScanned.current_stock} db</span>
              </div>
            </div>
          )}

          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Bevételezendő tételek</h3>

            {receiptCart.length === 0 ? (
              <div style={{ padding: '60px 40px', textAlign: 'center', color: '#64748b', border: '2px dashed #1e293b', borderRadius: '8px' }}>
                Még nincs tétel. Kattintson ide, majd olvassa be a termék vonalkódját, vagy keressen név alapján.
              </div>
            ) : (
              <table className="dense-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Belső kód</th>
                    <th>Termék név</th>
                    <th style={{ width: '100px' }}>Mennyiség</th>
                    <th style={{ width: '140px' }}>Nettó egységár (Ft)</th>
                    <th style={{ textAlign: 'center' }}>Jelenlegi / Korábbi ár</th>
                    <th>Művelet</th>
                  </tr>
                </thead>
                <tbody>
                  {receiptCart.map(item => {
                    const priceChanged = item.price_net !== item.original_price_net;
                    const diffPct = item.original_price_net > 0 
                      ? ((item.price_net - item.original_price_net) / item.original_price_net) * 100 
                      : 0;
                    const significantChange = Math.abs(diffPct) >= 20;

                    return (
                      <tr key={item.product_id}>
                        <td style={{ fontFamily: 'monospace', color: '#38bdf8' }}>{item.barcode}</td>
                        <td style={{ fontWeight: '500' }}>
                          {item.name}
                          {significantChange && (
                            <span 
                              title={`Figyelem! Az egységár jelentősen megváltozott (${diffPct > 0 ? '+' : ''}${diffPct.toFixed(0)}%)!`} 
                              style={{ marginLeft: '8px', color: '#f59e0b', cursor: 'help', display: 'inline-flex', alignItems: 'center' }}
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
                              setReceiptCart(prev => prev.map(i => i.product_id === item.product_id ? { ...i, quantity: val } : i));
                            }}
                            style={{ width: '80px', padding: '6px', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '4px' }} 
                          />
                        </td>
                        <td>
                          <input 
                            type="number" 
                            min="0"
                            value={item.price_net} 
                            onChange={e => {
                              const val = Math.max(0, Number(e.target.value) || 0);
                              setReceiptCart(prev => prev.map(i => i.product_id === item.product_id ? { ...i, price_net: val } : i));
                            }}
                            style={{
                              width: '120px', padding: '6px', backgroundColor: '#0f172a',
                              border: priceChanged ? '1px solid #f59e0b' : '1px solid #334155',
                              color: priceChanged ? '#f59e0b' : 'white', borderRadius: '4px'
                            }} 
                          />
                        </td>
                        <td style={{ textAlign: 'center', fontSize: '13px' }}>
                          <span style={{ color: '#94a3b8' }}>{item.current_stock} db</span>
                          <span style={{ margin: '0 6px', color: '#475569' }}>/</span>
                          <span style={{ textDecoration: priceChanged ? 'line-through' : 'none', color: '#64748b' }}>
                            {item.original_price_net} Ft
                          </span>
                        </td>
                        <td>
                          <button 
                            onClick={() => setReceiptCart(prev => prev.filter(i => i.product_id !== item.product_id))} 
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

        {/* Right Side: Finalization Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '16px' }}>Bizonylat adatai</h3>
            
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>
                Cél raktárhely <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select 
                value={receiptLocation} 
                onChange={e => setReceiptLocation(e.target.value)} 
                required 
                style={{
                  width: '100%', padding: '10px', backgroundColor: '#0f172a', 
                  border: !receiptLocation ? '1px solid #f87171' : '1px solid #334155',
                  color: '#f8fafc', borderRadius: '6px'
                }}
              >
                <option value="">Válasszon cél raktárhelyet...</option>
                {locations.filter(l => !l.is_archived).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Bizonylatszám / Hivatkozás</label>
              <input type="text" value={receiptRef} onChange={e => setReceiptRef(e.target.value)} placeholder="pl. SZLA-2026/001" style={{ width: '100%', padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px' }} />
            </div>

            <div style={{ marginTop: '20px', borderTop: '1px solid #1e293b', paddingTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '14px' }}>
                <span>Összes tétel:</span>
                <span style={{ fontWeight: 'bold' }}>{receiptCart.reduce((a, c) => a + c.quantity, 0)} db</span>
              </div>
              
              <button 
                onClick={handleFinalizeReceipt} 
                disabled={receiptCart.length === 0 || !receiptLocation}
                style={{
                  width: '100%', padding: '12px', 
                  backgroundColor: (receiptCart.length === 0 || !receiptLocation) ? '#1e293b' : '#22c55e',
                  color: (receiptCart.length === 0 || !receiptLocation) ? '#64748b' : 'white', 
                  border: 'none', borderRadius: '6px', fontWeight: 'bold', 
                  cursor: (receiptCart.length === 0 || !receiptLocation) ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.2s'
                }}
              >
                Bevételezés véglegesítése
              </button>
              
              {(receiptCart.length === 0 || !receiptLocation) && (
                <small style={{ color: '#ef4444', fontSize: '11px', display: 'block', marginTop: '6px', textAlign: 'center' }}>
                  {receiptCart.length === 0 
                    ? "Vegyen fel legalább 1 terméket a bevételezéshez!" 
                    : "Válassza ki a cél raktárhelyet!"
                  }
                </small>
              )}
            </div>
          </div>

          {/* Inline Help Panel */}
          <div className="glass-panel" style={{ padding: '16px', backgroundColor: 'rgba(30,41,59,0.3)', border: '1px dashed #1e293b' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', color: '#38bdf8' }}>
              <Info size={16} />
              <strong style={{ fontSize: '13px' }}>Útmutató a bevételezéshez</strong>
            </div>
            <ol style={{ paddingLeft: '16px', margin: 0, fontSize: '12px', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <li>Olvassa be a termék vonalkódját a felső mezőben, vagy keressen rá név alapján.</li>
              <li>A tételek listájában ellenőrizze a bevételezendő mennyiséget és nettó árat.</li>
              <li>Válassza ki a cél raktárhelyet, majd kattintson a véglegesítés gombra.</li>
            </ol>
          </div>

        </div>
      </div>

      {/* Unknown Barcode Options Modal */}
      {unknownBarcode && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
          <div className="glass-panel" style={{ padding: '24px', maxWidth: '450px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <AlertTriangle size={48} style={{ color: '#f59e0b', margin: '0 auto' }} />
            <h3 style={{ margin: 0, fontSize: '18px' }}>Ismeretlen vonalkód: {unknownBarcode}</h3>
            <p style={{ fontSize: '14px', color: '#cbd5e1', margin: 0 }}>
              A beolvasott vonalkód nem található a terméktörzsben. Mit szeretne tenni?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
              <button 
                onClick={() => {
                  setQuickName('');
                  setQuickSku('');
                  setQuickPriceNet('0');
                  setQuickPriceGross('0');
                  setQuickSaleNet('0');
                  setQuickSaleGross('0');
                  setShowQuickCreate(true);
                }}
                style={{ padding: '12px', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Új termék létrehozása ezzel a kóddal
              </button>
              <button 
                onClick={() => {
                  setLinkSearch('');
                  setShowLinkProduct(true);
                }}
                style={{ padding: '12px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#38bdf8', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Összekapcsolás meglévő termékkel (EAN-ként)
              </button>
              <button 
                onClick={() => setUnknownBarcode(null)}
                style={{ padding: '12px', backgroundColor: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                Mégse
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Create Dialog */}
      {showQuickCreate && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 101 }}>
          <form onSubmit={handleQuickCreateSubmit} className="glass-panel" style={{ padding: '24px', width: '500px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0 }}>Új termék gyors felvétele</h3>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
              Vonalkód: <strong>{unknownBarcode}</strong>
            </p>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Termék név *</label>
              <input type="text" value={quickName} onChange={e => setQuickName(e.target.value)} required style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Cikkszám (SKU)</label>
              <input type="text" value={quickSku} onChange={e => setQuickSku(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Nettó beszerzési ár (Ft)</label>
                <input type="number" value={quickPriceNet} onChange={e => setQuickPriceNet(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Bruttó beszerzési ár (Ft)</label>
                <input type="number" value={quickPriceGross} onChange={e => setQuickPriceGross(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Nettó eladási ár (Ft)</label>
                <input type="number" value={quickSaleNet} onChange={e => setQuickSaleNet(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Bruttó eladási ár (Ft)</label>
                <input type="number" value={quickSaleGross} onChange={e => setQuickSaleGross(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
              <button type="submit" style={{ flex: 1, padding: '10px', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Termék létrehozása</button>
              <button type="button" onClick={() => setShowQuickCreate(false)} style={{ flex: 1, padding: '10px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#cbd5e1', borderRadius: '6px', cursor: 'pointer' }}>Vissza</button>
            </div>
          </form>
        </div>
      )}

      {/* Link Product Dialog */}
      {showLinkProduct && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 101 }}>
          <div className="glass-panel" style={{ padding: '24px', width: '500px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0 }}>Összekapcsolás meglévő termékkel</h3>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
              Szkennelt kód: <strong>{unknownBarcode}</strong> (EAN kódként lesz hozzárendelve a választott termékhez)
            </p>

            <input 
              type="text" 
              value={linkSearch} 
              onChange={e => setLinkSearch(e.target.value)} 
              placeholder="Keressen termékre név vagy vonalkód alapján..."
              style={{ width: '100%', padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }}
            />

            <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #1e293b', borderRadius: '6px' }}>
              {products.filter(p => p.name.toLowerCase().includes(linkSearch.toLowerCase()) || p.barcode.includes(linkSearch)).slice(0, 10).map(p => (
                <div 
                  key={p.id} 
                  onClick={() => handleLinkProduct(p)}
                  style={{ padding: '10px 12px', borderBottom: '1px solid #1e293b', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
                  className="search-item-hover"
                >
                  <span>{p.name}</span>
                  <span style={{ color: '#64748b' }}>({p.barcode})</span>
                </div>
              ))}
            </div>

            <button type="button" onClick={() => setShowLinkProduct(false)} style={{ width: '100%', padding: '10px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#cbd5e1', borderRadius: '6px', cursor: 'pointer' }}>Vissza</button>
          </div>
        </div>
      )}

    </div>
  );
}
