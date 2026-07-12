
// Hungarian Date/Currency Helpers
const formatHUF = (value: number) => {
  return new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(value);
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('hu-HU');
};

interface DashboardProps {
  products: any[];
  movements: any[];
  sseEvents: string[];
}

export default function Dashboard({ products, movements, sseEvents }: DashboardProps) {
  return (
    <div>
      <h1 style={{ fontSize: '24px', margin: '0 0 20px 0' }}>Üzleti Áttekintő</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ fontSize: '14px', color: '#94a3b8' }}>Összes termék a rendszerben</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#38bdf8', marginTop: '8px' }}>{products.length} db</div>
        </div>
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ fontSize: '14px', color: '#94a3b8' }}>Teljes készletérték (Beszerzés)</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#4ade80', marginTop: '8px' }}>
            {formatHUF(products.reduce((acc, curr) => acc + (curr.current_stock * curr.purchase_price_net), 0))}
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ fontSize: '14px', color: '#94a3b8' }}>Potenciális kiskereskedelmi érték</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#facc15', marginTop: '8px' }}>
            {formatHUF(products.reduce((acc, curr) => acc + (curr.current_stock * curr.sale_price_gross), 0))}
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ fontSize: '14px', color: '#94a3b8' }}>Készlethiányos termékek</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#f87171', marginTop: '8px' }}>
            {products.filter(p => p.current_stock <= p.minimum_stock).length} db
          </div>
        </div>
      </div>

      {/* Recent Movements Widget */}
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Legutóbbi Készletmozgások</h3>
        <div className="table-container">
          <table className="dense-table">
            <thead>
              <tr>
                <th>Időpont</th>
                <th>Termék</th>
                <th>Vonalkód</th>
                <th>Típus</th>
                <th>Változás</th>
                <th>Készlet utána</th>
                <th>Felhasználó</th>
              </tr>
            </thead>
            <tbody>
              {movements.slice(0, 5).map((mov, idx) => (
                <tr key={idx}>
                  <td>{formatDate(mov.timestamp)}</td>
                  <td>{mov.product_name}</td>
                  <td style={{ fontFamily: 'monospace' }}>{mov.barcode}</td>
                  <td><span className="badge badge-info">{mov.movement_type}</span></td>
                  <td style={{ fontWeight: 'bold', color: mov.quantity_delta > 0 ? '#4ade80' : '#f87171' }}>
                    {mov.quantity_delta > 0 ? `+${mov.quantity_delta}` : mov.quantity_delta} db
                  </td>
                  <td>{mov.stock_after} db</td>
                  <td>{mov.user}</td>
                </tr>
              ))}
              {movements.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: '#475569' }}>Nincs rögzített készletmozgás.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Real-time event notifications view */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Valós idejű eseménycsatorna (Server-Sent Events)</h3>
        <div style={{ maxHeight: '200px', overflowY: 'auto', backgroundColor: '#090d16', padding: '12px', borderRadius: '6px', fontSize: '13px', fontFamily: 'monospace' }}>
          {sseEvents.length === 0 ? (
            <span style={{ color: '#475569' }}>Nincs aktív esemény a csatornán. Végezzen bevételezést vagy kiadást a teszteléshez...</span>
          ) : (
            sseEvents.map((e, idx) => <div key={idx} style={{ padding: '4px 0', borderBottom: '1px solid #1e293b' }}>{e}</div>)
          )}
        </div>
      </div>
    </div>
  );
}
