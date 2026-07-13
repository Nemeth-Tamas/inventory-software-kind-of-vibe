import { Package, LayoutDashboard, ShoppingCart, ArrowLeftRight, ClipboardCheck, History, RefreshCw, Settings } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  setActiveStocktake: (st: any) => void;
  currentUser: any;
  handleLogout: () => void;
}

export default function Sidebar({ activeTab, setActiveTab, setActiveStocktake, currentUser, handleLogout }: SidebarProps) {
  const menuItems = [
    { id: 'dashboard', label: 'Áttekintés', icon: LayoutDashboard },
    { id: 'products', label: 'Termékek', icon: Package },
    { id: 'receipt', label: 'Bevételezés', icon: ShoppingCart },
    { id: 'opening_stock', label: 'Nyitókészlet', icon: Package },
    { id: 'issue', label: 'Kiadás', icon: ArrowLeftRight },
    { id: 'stocktake', label: 'Leltár (Leltározás)', icon: ClipboardCheck },
    { id: 'billingo', label: 'Billingo Import', icon: RefreshCw },
    { id: 'audit', label: 'Rendszernapló', icon: History }
  ];

  if (currentUser?.role === 'adminisztrátor') {
    menuItems.push({ id: 'settings', label: 'Beállítások', icon: Settings });
  }

  return (
    <aside style={{ width: '260px', backgroundColor: '#0f172a', borderRight: '1px solid #1e293b', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '24px', borderBottom: '1px solid #1e293b' }}>
        <h2 style={{ color: '#38bdf8', fontSize: '18px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Package size={20} /> Szerviz Raktár
        </h2>
        <span style={{ fontSize: '11px', color: '#64748b' }}>Rendszer v1.0.0</span>
      </div>

      <nav style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {menuItems.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setActiveStocktake(null); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                width: '100%',
                padding: '12px 16px',
                backgroundColor: activeTab === tab.id ? '#1e293b' : 'transparent',
                color: activeTab === tab.id ? '#38bdf8' : '#94a3b8',
                border: 'none',
                borderRadius: '8px',
                textAlign: 'left',
                cursor: 'pointer',
                fontWeight: '500',
                transition: '0.2s'
              }}
            >
              <Icon size={18} /> {tab.label}
            </button>
          );
        })}
      </nav>

      <div style={{ padding: '16px', borderTop: '1px solid #1e293b', backgroundColor: '#090d16' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
            U
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 'bold' }}>{currentUser?.username}</div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>{currentUser?.role}</div>
          </div>
        </div>
        <button onClick={handleLogout} style={{ width: '100%', padding: '8px', backgroundColor: '#334155', color: '#f8fafc', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>Kijelentkezés</button>
      </div>
    </aside>
  );
}
