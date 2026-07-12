
const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('hu-HU');
};

interface AuditLogsProps {
  auditLogs: any[];
}

export default function AuditLogs({ auditLogs }: AuditLogsProps) {
  return (
    <div>
      <h1 style={{ fontSize: '24px', margin: '0 0 20px 0' }}>Rendszerbiztonsági és Műveleti Napló (Immutable Audit Log)</h1>
      <div className="table-container">
        <table className="dense-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Időpont</th>
              <th>Felhasználó</th>
              <th>Művelet / Esemény</th>
              <th>Részletek</th>
            </tr>
          </thead>
          <tbody>
            {auditLogs.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: '#64748b' }}>Nincs bejegyzés a naplóban.</td>
              </tr>
            ) : (
              auditLogs.map(log => (
                <tr key={log.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(log.timestamp)}</td>
                  <td style={{ fontWeight: 'bold', color: '#38bdf8' }}>{log.username}</td>
                  <td style={{ fontWeight: '500' }}>{log.action}</td>
                  <td style={{ color: '#94a3b8' }}>{log.details || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
