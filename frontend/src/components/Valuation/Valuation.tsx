import { useState, useEffect } from 'react';
import { Download, AlertTriangle, RefreshCw, Layers, MapPin } from 'lucide-react';
import { API_BASE } from '../../config';

interface ValuationProps {
  token: string | null;
  categories: any[];
  locations: any[];
}

export default function Valuation({ token, categories, locations }: ValuationProps) {
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>({ items: [], total_stock: 0, total_value_net: 0, total_value_gross: 0 });

  const formatHUF = (value: number) => {
    return new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(value);
  };

  const fetchValuation = async () => {
    if (!token) return;
    setLoading(true);
    try {
      let url = `${API_BASE}/inventory/valuation?`;
      if (selectedCategory) url += `category_id=${selectedCategory}&`;
      if (selectedLocation) url += `location_id=${selectedLocation}&`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setData(await response.json());
      }
    } catch (err) {
      console.error("Hiba a készletérték lekérésekor", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchValuation();
  }, [selectedCategory, selectedLocation, token]);

  const handleExportExcel = () => {
    let url = `${API_BASE}/excel/export/valuation?`;
    if (selectedCategory) url += `category_id=${selectedCategory}&`;
    if (selectedLocation) url += `location_id=${selectedLocation}&`;
    
    // Trigger download using hidden link or window.location
    window.location.href = url;
  };

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', color: '#f8fafc' }}>
      <div>
        <h1 style={{ color: '#38bdf8', fontSize: '28px', fontWeight: 'bold', margin: 0 }}>Készletérték Jelentés</h1>
        <p style={{ color: '#94a3b8', fontSize: '14px', margin: '4px 0 0 0' }}>Teljes raktárkészlet aktuális beszerzési értékének kimutatása</p>
      </div>

      {/* Filter and Export Bar */}
      <div className="glass-panel" style={{ padding: '16px', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={18} style={{ color: '#64748b' }} />
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            style={{ padding: '8px 12px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', fontSize: '14px' }}
          >
            <option value="">Összes kategória</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MapPin size={18} style={{ color: '#64748b' }} />
          <select
            value={selectedLocation}
            onChange={e => setSelectedLocation(e.target.value)}
            style={{ padding: '8px 12px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', fontSize: '14px' }}
          >
            <option value="">Összes helyszín (Alapértelmezett)</option>
            {locations.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        <button
          onClick={fetchValuation}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
        >
          <RefreshCw size={16} className={loading ? 'spin-anim' : ''} /> Frissítés
        </button>

        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={handleExportExcel}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', backgroundColor: '#0284c7', border: 'none', color: '#ffffff', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
          >
            <Download size={16} /> Excel Letöltés
          </button>
        </div>
      </div>

      {/* Totals Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '14px', color: '#94a3b8' }}>Összesített Készlet</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#38bdf8' }}>{data.total_stock} db</div>
        </div>
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '14px', color: '#94a3b8' }}>Teljes Nettó Érték</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#22c55e' }}>{formatHUF(data.total_value_net)}</div>
        </div>
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '14px', color: '#94a3b8' }}>Teljes Bruttó Érték</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#10b981' }}>{formatHUF(data.total_value_gross)}</div>
        </div>
      </div>

      {/* Warning if any product has missing price */}
      {data.items.some((i: any) => i.price_warning) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid #f59e0b', borderRadius: '8px', color: '#fbbf24', fontSize: '14px' }}>
          <AlertTriangle size={20} />
          <span>Figyelem! Egyes termékeknél nincs beállítva beszerzési ár. Ezek 0 Ft-tal szerepelnek a kalkulációban.</span>
        </div>
      )}

      {/* Valuation Table */}
      <div className="glass-panel" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1e293b', color: '#94a3b8' }}>
              <th style={{ padding: '16px' }}>Terméknév</th>
              <th style={{ padding: '16px' }}>SKU</th>
              <th style={{ padding: '16px' }}>Kategória</th>
              <th style={{ padding: '16px' }}>Alapértelmezett Helyszín</th>
              <th style={{ padding: '16px', textAlign: 'right' }}>Készlet</th>
              <th style={{ padding: '16px', textAlign: 'right' }}>Nettó Egységár</th>
              <th style={{ padding: '16px', textAlign: 'right' }}>Bruttó Egységár</th>
              <th style={{ padding: '16px', textAlign: 'right' }}>Összesített Nettó Érték</th>
              <th style={{ padding: '16px', textAlign: 'right' }}>Összesített Bruttó Érték</th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                  Nem található a szűrésnek megfelelő termék.
                </td>
              </tr>
            ) : (
              data.items.map((item: any) => (
                <tr
                  key={item.product_id}
                  style={{
                    borderBottom: '1px solid #0f172a',
                    backgroundColor: item.price_warning ? 'rgba(245, 158, 11, 0.03)' : 'transparent',
                    transition: '0.2s'
                  }}
                >
                  <td style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {item.price_warning && (
                      <span title="Hiányzó beszerzési ár" style={{ display: 'flex', alignItems: 'center' }}>
                        <AlertTriangle size={16} style={{ color: '#fbbf24' }} />
                      </span>
                    )}
                    {item.product_name}
                  </td>
                  <td style={{ padding: '14px 16px', color: '#94a3b8' }}>{item.sku}</td>
                  <td style={{ padding: '14px 16px' }}>{item.category_name}</td>
                  <td style={{ padding: '14px 16px' }}>{item.location_name}</td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 'bold' }}>{item.current_stock} db</td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', color: item.purchase_price_net === 0 ? '#fbbf24' : '#e2e8f0' }}>
                    {formatHUF(item.purchase_price_net)}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', color: item.purchase_price_gross === 0 ? '#fbbf24' : '#e2e8f0' }}>
                    {formatHUF(item.purchase_price_gross)}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', color: '#22c55e', fontWeight: '500' }}>
                    {formatHUF(item.total_value_net)}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', color: '#10b981', fontWeight: '500' }}>
                    {formatHUF(item.total_value_gross)}
                  </td>
                </tr>
              ))
            )}
            {data.items.length > 0 && (
              <tr style={{ borderTop: '2px solid #1e293b', backgroundColor: '#090d16', fontWeight: 'bold' }}>
                <td colSpan={4} style={{ padding: '16px' }}>ÖSSZESEN</td>
                <td style={{ padding: '16px', textAlign: 'right', color: '#38bdf8' }}>{data.total_stock} db</td>
                <td colSpan={2} style={{ padding: '16px' }}></td>
                <td style={{ padding: '16px', textAlign: 'right', color: '#22c55e' }}>{formatHUF(data.total_value_net)}</td>
                <td style={{ padding: '16px', textAlign: 'right', color: '#10b981' }}>{formatHUF(data.total_value_gross)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
