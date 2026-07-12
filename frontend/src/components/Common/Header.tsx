import { Volume2 } from 'lucide-react';

interface HeaderProps {
  sseStatus: string;
  scanStatus: string;
  lastScannedBarcode: string;
  soundEnabled: boolean;
  setSoundEnabled: (val: boolean) => void;
}

export default function Header({ sseStatus, scanStatus, lastScannedBarcode, soundEnabled, setSoundEnabled }: HeaderProps) {
  return (
    <header style={{ height: '64px', borderBottom: '1px solid #1e293b', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0f172a' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#94a3b8' }}>
          <span>SSE Kapcsolat:</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: sseStatus === 'Online' ? '#4ade80' : '#f87171', fontWeight: 'bold' }}>
            <span className="glow-dot" style={{ backgroundColor: sseStatus === 'Online' ? '#22c55e' : '#ef4444' }}></span>
            {sseStatus}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#94a3b8' }}>
          <span>Olvasó:</span>
          <span className="badge badge-info">{scanStatus} {lastScannedBarcode && `(${lastScannedBarcode})`}</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => setSoundEnabled(!soundEnabled)} style={{ padding: '8px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '6px', cursor: 'pointer', color: '#f8fafc' }}>
          <Volume2 size={16} color={soundEnabled ? '#4ade80' : '#94a3b8'} />
        </button>
        <span style={{ fontSize: '12px', color: '#475569' }}>Próbálja ki: nyomja meg a Ctrl+K gyorsgombot</span>
      </div>
    </header>
  );
}
