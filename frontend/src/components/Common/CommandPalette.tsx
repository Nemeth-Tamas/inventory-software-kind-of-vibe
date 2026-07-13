import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  products: any[];
  onSelectProduct: (product: any) => void;
}

export default function CommandPalette({ isOpen, onClose, products, onSelectProduct }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const filtered = products.filter(p => 
    p.name.toLowerCase().includes(query.toLowerCase()) ||
    p.sku.toLowerCase().includes(query.toLowerCase()) ||
    p.barcode.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 8);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        onSelectProduct(filtered[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filtered, selectedIndex]);

  if (!isOpen) return null;

  return (
    <div 
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', paddingTop: '100px', zIndex: 1000 }}
    >
      <div className="glass-panel" style={{ width: '600px', height: 'fit-content', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px', borderBottom: '1px solid #1e293b' }}>
          <Search size={20} color="#94a3b8" style={{ marginRight: '12px' }} />
          <input 
            type="text" 
            autoFocus 
            value={query} 
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }} 
            placeholder="Keressen név, cikkszám vagy vonalkód alapján..." 
            style={{ width: '100%', background: 'none', border: 'none', color: '#f8fafc', fontSize: '16px', outline: 'none' }} 
          />
          <button onClick={onClose} style={{ padding: '4px 8px', backgroundColor: '#1e293b', border: 'none', color: '#64748b', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>ESC</button>
        </div>

        <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>Nincs találat.</div>
          ) : (
            filtered.map((p, idx) => (
              <div
                key={p.id}
                onClick={() => onSelectProduct(p)}
                style={{
                  padding: '12px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  backgroundColor: selectedIndex === idx ? '#1e293b' : 'transparent',
                  color: selectedIndex === idx ? '#38bdf8' : '#cbd5e1',
                  cursor: 'pointer'
                }}
              >
                <div>
                  <div style={{ fontWeight: 'bold' }}>{p.name}</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>SKU: {p.sku} | Vonalkód: {p.barcode}</div>
                </div>
                <div style={{ fontSize: '13px', fontWeight: 'bold' }}>Készlet: {p.current_stock} db</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
