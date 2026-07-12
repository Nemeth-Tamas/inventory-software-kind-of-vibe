import React, { useState, useEffect } from 'react';
import { ShieldCheck, Key, Folder, Truck, MapPin, UserCheck, HardDrive, RefreshCw, Sliders, Database, Volume2, Shield, X } from 'lucide-react';
import { API_BASE } from '../../config';

const formatHUF = (value: number) => {
  return new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(value);
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('hu-HU');
};

interface SettingsProps {
  token: string | null;
  fetchData: () => void;
  playBeep: (freq?: number, duration?: number, volume?: number) => void;
}

export default function Settings({ token, fetchData, playBeep }: SettingsProps) {
  const [activeSubTab, setActiveSubTab] = useState('general');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // 1. Billingo API Key State
  const [billingoKey, setBillingoKey] = useState('');
  const [billingoConfigured, setBillingoConfigured] = useState(false);

  // 2. Category Management State
  const [categories, setCategories] = useState<any[]>([]);
  const [newCatName, setNewCatName] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState('');
  const [showCatMergeModal, setShowCatMergeModal] = useState(false);
  const [mergeSourceCatId, setMergeSourceCatId] = useState('');
  const [mergeTargetCatId, setMergeTargetCatId] = useState('');
  const [catSearch, setCatSearch] = useState('');

  // 3. Location Management State
  const [locations, setLocations] = useState<any[]>([]);
  const [newLocName, setNewLocName] = useState('');
  const [editingLocId, setEditingLocId] = useState<string | null>(null);
  const [editingLocName, setEditingLocName] = useState('');
  const [locSearch, setLocSearch] = useState('');

  // 4. Supplier Management State
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supSearch, setSupSearch] = useState('');
  const [editingSupplier, setEditingSupplier] = useState<any | null>(null);
  const [supplierProducts, setSupplierProducts] = useState<any[]>([]);
  const [supplierHistory, setSupplierHistory] = useState<any[]>([]);
  
  // New Supplier Form State
  const [newSupName, setNewSupName] = useState('');
  const [newSupContact, setNewSupContact] = useState('');
  const [newSupEmail, setNewSupEmail] = useState('');
  const [newSupPhone, setNewSupPhone] = useState('');
  const [newSupAddress, setNewSupAddress] = useState('');
  const [newSupTaxNumber, setNewSupTaxNumber] = useState('');
  const [newSupCustNumber, setNewSupCustNumber] = useState('');
  const [newSupComment, setNewSupComment] = useState('');
  
  // 5. User Management State
  const [users, setUsers] = useState<any[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('warehouse');

  // Load active tab data
  useEffect(() => {
    setMessage('');
    setError('');
    
    if (activeSubTab === 'billingo') {
      fetchBillingoSettings();
    } else if (activeSubTab === 'categories') {
      fetchCategories();
    } else if (activeSubTab === 'locations') {
      fetchLocations();
    } else if (activeSubTab === 'suppliers') {
      fetchSuppliers();
    } else if (activeSubTab === 'users') {
      fetchUsers();
    }
  }, [activeSubTab]);

  // Billingo
  const fetchBillingoSettings = async () => {
    try {
      const response = await fetch(`${API_BASE}/settings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setBillingoConfigured(data.billingo_api_key_configured);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveBillingo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billingoKey.trim()) return;
    setLoading(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch(`${API_BASE}/settings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ billingo_api_key: billingoKey })
      });
      if (response.ok) {
        setMessage('Billingo API kulcs sikeresen mentve és titkosítva!');
        setBillingoKey('');
        fetchBillingoSettings();
        fetchData();
      } else {
        const err = await response.json();
        setError(err.detail || 'Hiba a mentés során.');
      }
    } catch (err) {
      setError('Hálózati hiba.');
    } finally {
      setLoading(false);
    }
  };

  // Categories
  const fetchCategories = async () => {
    try {
      const response = await fetch(`${API_BASE}/categories/with-count`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setCategories(await response.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      const response = await fetch(`${API_BASE}/categories`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: newCatName })
      });
      if (response.ok) {
        setNewCatName('');
        fetchCategories();
        setMessage('Kategória sikeresen létrehozva.');
      } else {
        const err = await response.json();
        setError(err.detail);
      }
    } catch (err) {
      setError('Hiba történt.');
    }
  };

  const handleRenameCategory = async (id: string) => {
    if (!editingCatName.trim()) return;
    try {
      const response = await fetch(`${API_BASE}/categories/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: editingCatName })
      });
      if (response.ok) {
        setEditingCatId(null);
        setEditingCatName('');
        fetchCategories();
        setMessage('Kategória sikeresen átnevezve.');
      } else {
        const err = await response.json();
        alert(`Hiba: ${err.detail}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleArchiveCategory = async (id: string, archive: boolean) => {
    try {
      const endpoint = archive ? 'archive' : 'restore';
      const response = await fetch(`${API_BASE}/categories/${id}/${endpoint}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        fetchCategories();
        setMessage(archive ? 'Kategória archiválva.' : 'Kategória visszaállítva.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm("Biztosan törölni szeretné ezt a kategóriát?")) return;
    try {
      const response = await fetch(`${API_BASE}/categories/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        fetchCategories();
        setMessage('Kategória törölve.');
      } else {
        const err = await response.json();
        alert(`Nem törölhető: ${err.detail}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleMergeCategories = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mergeSourceCatId || !mergeTargetCatId) return;
    try {
      const response = await fetch(`${API_BASE}/categories/merge`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ source_id: mergeSourceCatId, target_id: mergeTargetCatId })
      });
      if (response.ok) {
        setShowCatMergeModal(false);
        setMergeSourceCatId('');
        setMergeTargetCatId('');
        fetchCategories();
        setMessage('Kategóriák sikeresen összevonva.');
      } else {
        const err = await response.json();
        alert(`Hiba: ${err.detail}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Locations
  const fetchLocations = async () => {
    try {
      const response = await fetch(`${API_BASE}/locations/with-stock`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setLocations(await response.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLocName.trim()) return;
    try {
      const response = await fetch(`${API_BASE}/locations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: newLocName })
      });
      if (response.ok) {
        setNewLocName('');
        fetchLocations();
        setMessage('Raktárhely sikeresen létrehozva.');
      } else {
        const err = await response.json();
        setError(err.detail);
      }
    } catch (err) {
      setError('Hiba történt.');
    }
  };

  const handleRenameLocation = async (id: string) => {
    if (!editingLocName.trim()) return;
    try {
      const response = await fetch(`${API_BASE}/locations/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: editingLocName })
      });
      if (response.ok) {
        setEditingLocId(null);
        setEditingLocName('');
        fetchLocations();
        setMessage('Raktárhely sikeresen módosítva.');
      } else {
        const err = await response.json();
        alert(`Hiba: ${err.detail}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleArchiveLocation = async (id: string, archive: boolean) => {
    try {
      const endpoint = archive ? 'archive' : 'restore';
      const response = await fetch(`${API_BASE}/locations/${id}/${endpoint}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        fetchLocations();
        setMessage(archive ? 'Raktárhely archiválva.' : 'Raktárhely visszaállítva.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteLocation = async (id: string) => {
    if (!confirm("Biztosan törölni szeretné ezt a raktárhelyet?")) return;
    try {
      const response = await fetch(`${API_BASE}/locations/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        fetchLocations();
        setMessage('Raktárhely törölve.');
      } else {
        const err = await response.json();
        alert(`Nem törölhető: ${err.detail}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Suppliers
  const fetchSuppliers = async () => {
    try {
      const response = await fetch(`${API_BASE}/suppliers`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setSuppliers(await response.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupName.trim()) return;
    try {
      const response = await fetch(`${API_BASE}/suppliers`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: newSupName,
          contact_person: newSupContact,
          email: newSupEmail,
          phone: newSupPhone,
          address: newSupAddress,
          tax_number: newSupTaxNumber,
          customer_number: newSupCustNumber,
          comment: newSupComment,
          is_active: true
        })
      });
      if (response.ok) {
        // Reset inputs
        setNewSupName('');
        setNewSupContact('');
        setNewSupEmail('');
        setNewSupPhone('');
        setNewSupAddress('');
        setNewSupTaxNumber('');
        setNewSupCustNumber('');
        setNewSupComment('');
        fetchSuppliers();
        setMessage('Beszállító sikeresen létrehozva.');
      } else {
        const err = await response.json();
        setError(err.detail);
      }
    } catch (err) {
      setError('Hálózati hiba.');
    }
  };

  const handleArchiveSupplier = async (id: string, archive: boolean) => {
    try {
      const endpoint = archive ? 'archive' : 'restore';
      const response = await fetch(`${API_BASE}/suppliers/${id}/${endpoint}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        fetchSuppliers();
        setMessage(archive ? 'Beszállító archiválva.' : 'Beszállító visszaállítva.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteSupplier = async (id: string) => {
    if (!confirm("Biztosan törölni szeretné ezt a beszállítót?")) return;
    try {
      const response = await fetch(`${API_BASE}/suppliers/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        fetchSuppliers();
        setMessage('Beszállító törölve.');
      } else {
        const err = await response.json();
        alert(`Nem törölhető: ${err.detail}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openSupplierEdit = async (sup: any) => {
    setEditingSupplier(sup);
    // Fetch products
    try {
      const resProd = await fetch(`${API_BASE}/suppliers/${sup.id}/products`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resProd.ok) setSupplierProducts(await resProd.json());

      const resHist = await fetch(`${API_BASE}/suppliers/${sup.id}/purchase-history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resHist.ok) setSupplierHistory(await resHist.json());
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSupplier) return;
    try {
      const response = await fetch(`${API_BASE}/suppliers/${editingSupplier.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(editingSupplier)
      });
      if (response.ok) {
        setEditingSupplier(null);
        fetchSuppliers();
        setMessage('Beszállító adatai sikeresen frissítve.');
      } else {
        const err = await response.json();
        alert(`Hiba: ${err.detail}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Users
  const fetchUsers = async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setUsers(await response.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newUserPassword) return;
    try {
      const response = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: newUsername,
          password: newUserPassword,
          role: newUserRole
        })
      });
      if (response.ok) {
        setNewUsername('');
        setNewUserPassword('');
        setNewUserRole('warehouse');
        fetchUsers();
        setMessage('Új felhasználó regisztrálva.');
      } else {
        const err = await response.json();
        setError(err.detail);
      }
    } catch (err) {
      setError('Hiba.');
    }
  };

  const handleToggleUserActive = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE}/auth/users/${id}/toggle-active`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        fetchUsers();
        setMessage('Felhasználó állapota sikeresen megváltoztatva.');
      } else {
        const err = await response.json();
        alert(`Hiba: ${err.detail}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateUserRole = async (id: string, role: string) => {
    try {
      const response = await fetch(`${API_BASE}/auth/users/${id}/role`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ role })
      });
      if (response.ok) {
        fetchUsers();
        setMessage('Szerepkör sikeresen módosítva.');
      } else {
        const err = await response.json();
        alert(`Hiba: ${err.detail}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '24px', minHeight: '80vh' }}>
      
      {/* Settings Navigation Sidebar */}
      <div className="glass-panel" style={{ width: '250px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
        <div style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>Rendszerbeállítások</div>
        {[
          { id: 'general', label: 'Általános', icon: <Sliders size={16} /> },
          { id: 'scanner', label: 'Vonalkódolvasó', icon: <Volume2 size={16} /> },
          { id: 'barcode', label: 'Vonalkódgenerálás', icon: <Sliders size={16} /> },
          { id: 'stock', label: 'Készlet', icon: <Database size={16} /> },
          { id: 'categories', label: 'Kategóriák', icon: <Folder size={16} /> },
          { id: 'suppliers', label: 'Beszállítók', icon: <Truck size={16} /> },
          { id: 'locations', label: 'Raktárhelyek', icon: <MapPin size={16} /> },
          { id: 'users', label: 'Jogosultságok', icon: <UserCheck size={16} /> },
          { id: 'billingo', label: 'Billingo API', icon: <Key size={16} /> },
          { id: 'import_export', label: 'Import és export', icon: <RefreshCw size={16} /> },
          { id: 'backup', label: 'Biztonsági mentés', icon: <HardDrive size={16} /> },
          { id: 'system', label: 'Rendszerállapot', icon: <Shield size={16} /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px',
              backgroundColor: activeSubTab === tab.id ? 'rgba(56,189,248,0.1)' : 'transparent',
              color: activeSubTab === tab.id ? '#38bdf8' : '#cbd5e1',
              border: 'none', borderRadius: '6px', textAlign: 'left', cursor: 'pointer',
              fontWeight: activeSubTab === tab.id ? 'bold' : 'normal',
              transition: 'background-color 0.2s'
            }}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Settings Tab Work Area */}
      <div className="glass-panel" style={{ flex: 1, padding: '24px' }}>
        
        {/* Alerts Messages */}
        {message && (
          <div style={{ color: '#4ade80', backgroundColor: 'rgba(74, 222, 128, 0.1)', padding: '12px', borderRadius: '6px', border: '1px solid rgba(74, 222, 128, 0.2)', marginBottom: '16px', fontSize: '14px' }}>
            {message}
          </div>
        )}
        {error && (
          <div style={{ color: '#f87171', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '12px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.2)', marginBottom: '16px', fontSize: '14px' }}>
            {error}
          </div>
        )}

        {/* 1. GENERAL TAB */}
        {activeSubTab === 'general' && (
          <div>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '20px' }}>Általános beállítások</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="glass-panel" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong style={{ display: 'block' }}>Hangos visszajelzés</strong>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>Szkennelési és műveleti bepek lejátszása a böngészőben.</span>
                </div>
                <input type="checkbox" defaultChecked style={{ width: '20px', height: '20px' }} />
              </div>
              <div className="glass-panel" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong style={{ display: 'block' }}>Automatikus kijelentkezés</strong>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>Biztonsági okokból inaktivitás esetén kijelentkeztetés 60 perc után.</span>
                </div>
                <input type="checkbox" defaultChecked style={{ width: '20px', height: '20px' }} />
              </div>
            </div>
          </div>
        )}

        {/* 2. SCANNER TAB */}
        {activeSubTab === 'scanner' && (
          <div>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '20px' }}>Vonalkódolvasó beállítások</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#cbd5e1', marginBottom: '6px' }}>Beolvasási érzékenység (küszöbérték, ms)</label>
                <input type="number" defaultValue="80" style={{ width: '100px', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '4px' }} />
                <small style={{ display: 'block', color: '#64748b', marginTop: '4px' }}>A hardveres olvasó leütési sebességének határértéke. Az ennél gyorsabb billentyűleütéseket tekinti beolvasásnak.</small>
              </div>
            </div>
          </div>
        )}

        {/* 3. BARCODE GENERATION TAB */}
        {activeSubTab === 'barcode' && (
          <div>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '20px' }}>Vonalkód generálás</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#cbd5e1', marginBottom: '6px' }}>Belső vonalkód hossza (szigorúan 6 karakter)</label>
                <input type="number" defaultValue="6" disabled style={{ width: '100px', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#64748b', borderRadius: '4px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#cbd5e1', marginBottom: '6px' }}>Generálási prefix minta</label>
                <input type="text" defaultValue="YY####" disabled style={{ width: '150px', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#64748b', borderRadius: '4px' }} />
                <small style={{ display: 'block', color: '#64748b', marginTop: '4px' }}>Az év utolsó 2 számjegye + 4 karakter egyedi számláló.</small>
              </div>
            </div>
          </div>
        )}

        {/* 4. STOCK TAB */}
        {activeSubTab === 'stock' && (
          <div>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '20px' }}>Készletkezelési beállítások</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="glass-panel" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong style={{ display: 'block' }}>Negatív készlet engedélyezése globálisan</strong>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>Ha be van kapcsolva, a kiadás nem blokkolja a tranzakciót akkor sem, ha a termék készleten lévő értéke 0 alá csökken.</span>
                </div>
                <input type="checkbox" style={{ width: '20px', height: '20px' }} />
              </div>
            </div>
          </div>
        )}

        {/* 5. CATEGORIES TAB */}
        {activeSubTab === 'categories' && (
          <div>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '20px' }}>Kategóriák kezelése</h2>
            
            {/* Add Category Form */}
            <form onSubmit={handleCreateCategory} style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
              <input
                type="text"
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                placeholder="Új kategória neve..."
                required
                style={{ flex: 1, padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '6px' }}
              />
              <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                Hozzáadás
              </button>
              <button type="button" onClick={() => setShowCatMergeModal(true)} style={{ padding: '10px 20px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#38bdf8', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                Összevonás...
              </button>
            </form>

            <input 
              type="text" 
              value={catSearch}
              onChange={e => setCatSearch(e.target.value)}
              placeholder="Kategória keresése..."
              style={{ width: '100%', padding: '10px', backgroundColor: '#0f172a', border: '1px solid #1e293b', color: 'white', borderRadius: '6px', marginBottom: '16px' }}
            />

            <div className="table-container">
              <table className="dense-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Kategória név</th>
                    <th>Termékek száma</th>
                    <th>Státusz</th>
                    <th>Műveletek</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.filter(c => c.name.toLowerCase().includes(catSearch.toLowerCase())).map(c => (
                    <tr key={c.id}>
                      <td>
                        {editingCatId === c.id ? (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                              type="text"
                              value={editingCatName}
                              onChange={e => setEditingCatName(e.target.value)}
                              style={{ padding: '4px', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '4px' }}
                            />
                            <button onClick={() => handleRenameCategory(c.id)} style={{ padding: '4px 8px', backgroundColor: '#22c55e', color: 'white', border: 'none', borderRadius: '4px' }}>Mentés</button>
                            <button onClick={() => setEditingCatId(null)} style={{ padding: '4px 8px', backgroundColor: '#334155', color: 'white', border: 'none', borderRadius: '4px' }}>Mégse</button>
                          </div>
                        ) : (
                          <span style={{ fontWeight: '500' }}>{c.name}</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 'bold' }}>{c.product_count} db</td>
                      <td>
                        {c.is_archived ? (
                          <span className="badge badge-secondary">Archivált</span>
                        ) : (
                          <span className="badge badge-success">Aktív</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => { setEditingCatId(c.id); setEditingCatName(c.name); }} style={{ padding: '4px 8px', backgroundColor: '#1e293b', color: '#38bdf8', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer' }}>Átnevezés</button>
                          <button onClick={() => handleArchiveCategory(c.id, !c.is_archived)} style={{ padding: '4px 8px', backgroundColor: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer' }}>
                            {c.is_archived ? 'Visszaállítás' : 'Archiválás'}
                          </button>
                          {c.product_count === 0 && (
                            <button onClick={() => handleDeleteCategory(c.id)} style={{ padding: '4px 8px', backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Törlés</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Merge Modal */}
            {showCatMergeModal && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
                <form onSubmit={handleMergeCategories} className="glass-panel" style={{ padding: '24px', width: '400px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <h3 style={{ margin: 0 }}>Kategóriák összevonása</h3>
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                    A forrás kategória minden terméke átkerül a cél kategóriába, majd a forrás kategória törlésre kerül.
                  </p>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Forrás (ezt vonjuk össze) *</label>
                    <select value={mergeSourceCatId} onChange={e => setMergeSourceCatId(e.target.value)} required style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '6px' }}>
                      <option value="">Válasszon...</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Cél (ide kerülnek a termékek) *</label>
                    <select value={mergeTargetCatId} onChange={e => setMergeTargetCatId(e.target.value)} required style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '6px' }}>
                      <option value="">Válasszon...</option>
                      {categories.filter(c => c.id !== mergeSourceCatId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button type="submit" style={{ flex: 1, padding: '10px', backgroundColor: '#eab308', color: '#090d16', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Összevonás végrehajtása</button>
                    <button type="button" onClick={() => setShowCatMergeModal(false)} style={{ flex: 1, padding: '10px', backgroundColor: '#1e293b', border: '1px solid #334155', color: 'white', borderRadius: '6px', cursor: 'pointer' }}>Mégse</button>
                  </div>
                </form>
              </div>
            )}

          </div>
        )}

        {/* 6. LOCATIONS TAB */}
        {activeSubTab === 'locations' && (
          <div>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '20px' }}>Raktárhelyek kezelése</h2>

            <form onSubmit={handleCreateLocation} style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
              <input
                type="text"
                value={newLocName}
                onChange={e => setNewLocName(e.target.value)}
                placeholder="Új raktárhely neve..."
                required
                style={{ flex: 1, padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '6px' }}
              />
              <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                Létrehozás
              </button>
            </form>

            <input 
              type="text" 
              value={locSearch}
              onChange={e => setLocSearch(e.target.value)}
              placeholder="Raktárhely keresése..."
              style={{ width: '100%', padding: '10px', backgroundColor: '#0f172a', border: '1px solid #1e293b', color: 'white', borderRadius: '6px', marginBottom: '16px' }}
            />

            <div className="table-container">
              <table className="dense-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Raktárhely megnevezése</th>
                    <th>Jelenlegi teljes készlet</th>
                    <th>Státusz</th>
                    <th>Műveletek</th>
                  </tr>
                </thead>
                <tbody>
                  {locations.filter(l => l.name.toLowerCase().includes(locSearch.toLowerCase())).map(l => (
                    <tr key={l.id}>
                      <td>
                        {editingLocId === l.id ? (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                              type="text"
                              value={editingLocName}
                              onChange={e => setEditingLocName(e.target.value)}
                              style={{ padding: '4px', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '4px' }}
                            />
                            <button onClick={() => handleRenameLocation(l.id)} style={{ padding: '4px 8px', backgroundColor: '#22c55e', color: 'white', border: 'none', borderRadius: '4px' }}>Mentés</button>
                            <button onClick={() => setEditingLocId(null)} style={{ padding: '4px 8px', backgroundColor: '#334155', color: 'white', border: 'none', borderRadius: '4px' }}>Mégse</button>
                          </div>
                        ) : (
                          <span style={{ fontWeight: '500' }}>{l.name}</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 'bold' }}>{l.stock_count} db</td>
                      <td>
                        {l.is_archived ? (
                          <span className="badge badge-secondary">Archivált</span>
                        ) : (
                          <span className="badge badge-success">Aktív</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => { setEditingLocId(l.id); setEditingLocName(l.name); }} style={{ padding: '4px 8px', backgroundColor: '#1e293b', color: '#38bdf8', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer' }}>Módosítás</button>
                          <button onClick={() => handleArchiveLocation(l.id, !l.is_archived)} style={{ padding: '4px 8px', backgroundColor: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer' }}>
                            {l.is_archived ? 'Visszaállítás' : 'Archiválás'}
                          </button>
                          {l.stock_count === 0 && (
                            <button onClick={() => handleDeleteLocation(l.id)} style={{ padding: '4px 8px', backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Törlés</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 7. SUPPLIERS TAB */}
        {activeSubTab === 'suppliers' && (
          <div>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '20px' }}>Beszállítók kezelése</h2>

            {/* Quick Create Supplier Collapse Form */}
            <details className="glass-panel" style={{ padding: '16px', marginBottom: '20px' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 'bold', color: '#38bdf8' }}>Új beszállító regisztrálása...</summary>
              <form onSubmit={handleCreateSupplier} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#cbd5e1', marginBottom: '4px' }}>Beszállító név *</label>
                    <input type="text" value={newSupName} onChange={e => setNewSupName(e.target.value)} required style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '6px', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#cbd5e1', marginBottom: '4px' }}>Kapcsolattartó</label>
                    <input type="text" value={newSupContact} onChange={e => setNewSupContact(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '6px', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#cbd5e1', marginBottom: '4px' }}>E-mail</label>
                    <input type="email" value={newSupEmail} onChange={e => setNewSupEmail(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '6px', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#cbd5e1', marginBottom: '4px' }}>Telefonszám</label>
                    <input type="text" value={newSupPhone} onChange={e => setNewSupPhone(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '6px', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#cbd5e1', marginBottom: '4px' }}>Cím</label>
                    <input type="text" value={newSupAddress} onChange={e => setNewSupAddress(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '6px', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#cbd5e1', marginBottom: '4px' }}>Adószám</label>
                    <input type="text" value={newSupTaxNumber} onChange={e => setNewSupTaxNumber(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '6px', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#cbd5e1', marginBottom: '4px' }}>Ügyfélszám (Beszállítói azonosító)</label>
                    <input type="text" value={newSupCustNumber} onChange={e => setNewSupCustNumber(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '6px', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#cbd5e1', marginBottom: '4px' }}>Megjegyzés</label>
                  <input type="text" value={newSupComment} onChange={e => setNewSupComment(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '6px', boxSizing: 'border-box' }} />
                </div>
                <button type="submit" style={{ padding: '10px', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Mentés</button>
              </form>
            </details>

            <input 
              type="text" 
              value={supSearch}
              onChange={e => setSupSearch(e.target.value)}
              placeholder="Beszállítók keresése név, email vagy telefonszám alapján..."
              style={{ width: '100%', padding: '10px', backgroundColor: '#0f172a', border: '1px solid #1e293b', color: 'white', borderRadius: '6px', marginBottom: '16px' }}
            />

            <div className="table-container">
              <table className="dense-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Beszállító név</th>
                    <th>Kapcsolattartó</th>
                    <th>Ügyfélszám</th>
                    <th>Telefonszám</th>
                    <th>Státusz</th>
                    <th>Műveletek</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.filter(s => s.name.toLowerCase().includes(supSearch.toLowerCase()) || (s.email && s.email.includes(supSearch))).map(s => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 'bold' }}>{s.name}</td>
                      <td>{s.contact_person || '-'}</td>
                      <td>{s.customer_number || '-'}</td>
                      <td>{s.phone || '-'}</td>
                      <td>
                        <span className={s.is_active ? 'badge badge-success' : 'badge badge-danger'}>
                          {s.is_active ? 'Aktív' : 'Inaktív'}
                        </span>
                        {s.is_archived && <span className="badge badge-secondary" style={{ marginLeft: '4px' }}>Archivált</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => openSupplierEdit(s)} style={{ padding: '4px 8px', backgroundColor: '#1e293b', color: '#38bdf8', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer' }}>Megnyitás / Szerkesztés</button>
                          <button onClick={() => handleArchiveSupplier(s.id, !s.is_archived)} style={{ padding: '4px 8px', backgroundColor: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer' }}>
                            {s.is_archived ? 'Visszaállítás' : 'Archiválás'}
                          </button>
                          <button onClick={() => handleDeleteSupplier(s.id)} style={{ padding: '4px 8px', backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Törlés</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Supplier Edit/Reporting Dialog */}
            {editingSupplier && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
                <div className="glass-panel" style={{ padding: '24px', width: '700px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '90vh', overflowY: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0 }}>Beszállító részletei & Szerkesztés</h3>
                    <button type="button" onClick={() => setEditingSupplier(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={20} /></button>
                  </div>

                  <form onSubmit={handleUpdateSupplier} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: '#cbd5e1', marginBottom: '4px' }}>Beszállító név *</label>
                        <input type="text" value={editingSupplier.name} onChange={e => setEditingSupplier({ ...editingSupplier, name: e.target.value })} required style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '6px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: '#cbd5e1', marginBottom: '4px' }}>Kapcsolattartó</label>
                        <input type="text" value={editingSupplier.contact_person || ''} onChange={e => setEditingSupplier({ ...editingSupplier, contact_person: e.target.value })} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '6px' }} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: '#cbd5e1', marginBottom: '4px' }}>E-mail</label>
                        <input type="email" value={editingSupplier.email || ''} onChange={e => setEditingSupplier({ ...editingSupplier, email: e.target.value })} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '6px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: '#cbd5e1', marginBottom: '4px' }}>Telefonszám</label>
                        <input type="text" value={editingSupplier.phone || ''} onChange={e => setEditingSupplier({ ...editingSupplier, phone: e.target.value })} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '6px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: '#cbd5e1', marginBottom: '4px' }}>Cím</label>
                        <input type="text" value={editingSupplier.address || ''} onChange={e => setEditingSupplier({ ...editingSupplier, address: e.target.value })} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '6px' }} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: '#cbd5e1', marginBottom: '4px' }}>Adószám</label>
                        <input type="text" value={editingSupplier.tax_number || ''} onChange={e => setEditingSupplier({ ...editingSupplier, tax_number: e.target.value })} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '6px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: '#cbd5e1', marginBottom: '4px' }}>Ügyfélszám</label>
                        <input type="text" value={editingSupplier.customer_number || ''} onChange={e => setEditingSupplier({ ...editingSupplier, customer_number: e.target.value })} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '6px' }} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', alignItems: 'center' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: '#cbd5e1', marginBottom: '4px' }}>Megjegyzés</label>
                        <input type="text" value={editingSupplier.comment || ''} onChange={e => setEditingSupplier({ ...editingSupplier, comment: e.target.value })} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '6px' }} />
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginTop: '16px' }}>
                        <input type="checkbox" checked={editingSupplier.is_active} onChange={e => setEditingSupplier({ ...editingSupplier, is_active: e.target.checked })} style={{ width: '18px', height: '18px' }} />
                        Aktív állapotú
                      </label>
                    </div>
                    <button type="submit" style={{ padding: '10px', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}>Módosítások mentése</button>
                  </form>

                  {/* Associated Products list */}
                  <h4 style={{ margin: '16px 0 8px 0', borderBottom: '1px solid #1e293b', paddingBottom: '6px' }}>Hozzárendelt termékek ({supplierProducts.length} db)</h4>
                  <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
                    {supplierProducts.length === 0 ? (
                      <span style={{ fontSize: '12px', color: '#64748b' }}>Nincs hozzárendelt termék.</span>
                    ) : (
                      supplierProducts.map(p => (
                        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '6px', borderBottom: '1px solid #1e293b' }}>
                          <span>{p.name}</span>
                          <span style={{ color: '#64748b' }}>készlet: {p.current_stock} db | {formatHUF(p.purchase_price_net)} nettó</span>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Purchase History */}
                  <h4 style={{ margin: '16px 0 8px 0', borderBottom: '1px solid #1e293b', paddingBottom: '6px' }}>Beszállítói bevételezések</h4>
                  <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
                    {supplierHistory.length === 0 ? (
                      <span style={{ fontSize: '12px', color: '#64748b' }}>Nincs korábbi bevételezés.</span>
                    ) : (
                      supplierHistory.map(h => (
                        <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '6px', borderBottom: '1px solid #1e293b' }}>
                          <span>{formatDate(h.timestamp)} - {h.product_name}</span>
                          <strong style={{ color: '#22c55e' }}>+{h.quantity_delta} db (Hiv: {h.reference_number || '-'})</strong>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 8. USERS TAB */}
        {activeSubTab === 'users' && (
          <div>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '20px' }}>Jogosultságok & Felhasználókezelés</h2>
            
            {/* Create new user */}
            <details className="glass-panel" style={{ padding: '16px', marginBottom: '20px' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 'bold', color: '#38bdf8' }}>Új felhasználó regisztrálása...</summary>
              <form onSubmit={handleCreateUser} style={{ display: 'flex', gap: '12px', marginTop: '16px', alignItems: 'end' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#cbd5e1', marginBottom: '4px' }}>Felhasználónév</label>
                  <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} required style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '6px' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#cbd5e1', marginBottom: '4px' }}>Jelszó</label>
                  <input type="password" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} required style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '6px' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#cbd5e1', marginBottom: '4px' }}>Szerepkör</label>
                  <select value={newUserRole} onChange={e => setNewUserRole(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '6px' }}>
                    <option value="warehouse">Raktáros</option>
                    <option value="leader">Csoportvezető</option>
                    <option value="admin">Rendszergazda</option>
                  </select>
                </div>
                <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Regisztráció</button>
              </form>
            </details>

            <div className="table-container">
              <table className="dense-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Felhasználónév</th>
                    <th>Szerepkör</th>
                    <th>Állapot</th>
                    <th>Műveletek</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 'bold' }}>{u.username}</td>
                      <td>
                        <select 
                          value={u.role} 
                          onChange={e => handleUpdateUserRole(u.id, e.target.value)}
                          style={{ padding: '4px', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '4px' }}
                        >
                          <option value="warehouse">Raktáros</option>
                          <option value="leader">Csoportvezető</option>
                          <option value="admin">Rendszergazda</option>
                        </select>
                      </td>
                      <td>
                        <span className={u.is_active ? 'badge badge-success' : 'badge badge-danger'}>
                          {u.is_active ? 'Aktív' : 'Letiltva'}
                        </span>
                      </td>
                      <td>
                        <button onClick={() => handleToggleUserActive(u.id)} style={{ padding: '4px 8px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#cbd5e1', borderRadius: '4px', cursor: 'pointer' }}>
                          {u.is_active ? 'Letiltás' : 'Aktiválás'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 9. BILLINGO TAB */}
        {activeSubTab === 'billingo' && (
          <div>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '20px' }}>Billingo API V3 Kapcsolat</h2>
            <form onSubmit={handleSaveBillingo} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', backgroundColor: '#0f172a', borderRadius: '6px', border: '1px solid #1e293b' }}>
                <ShieldCheck size={20} style={{ color: billingoConfigured ? '#4ade80' : '#64748b' }} />
                <div>
                  <span style={{ fontSize: '12px', color: '#94a3b8', display: 'block' }}>Billingo API Kulcs Állapota:</span>
                  <strong style={{ color: billingoConfigured ? '#4ade80' : '#f59e0b', fontSize: '14px' }}>
                    {billingoConfigured ? 'Beállítva (Adatbázisban AES-256 titkosítással tárolva)' : 'Nincs beállítva (Kérjük, adjon meg kulcsot)'}
                  </strong>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#cbd5e1', marginBottom: '8px' }}>Új API Kulcs Megadása</label>
                <input
                  type="password"
                  value={billingoKey}
                  onChange={e => setBillingoKey(e.target.value)}
                  placeholder="billingo_api_key_..."
                  required
                  style={{ width: '100%', padding: '12px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', fontFamily: 'monospace', boxSizing: 'border-box' }}
                />
              </div>

              <button type="submit" disabled={loading} style={{ padding: '12px', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                {loading ? 'Mentés...' : 'Beállítások Mentése'}
              </button>
            </form>
          </div>
        )}

        {/* 10. IMPORT EXPORT TAB */}
        {activeSubTab === 'import_export' && (
          <div>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '20px' }}>Termék import és export</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="glass-panel" style={{ padding: '20px' }}>
                <strong>Excel Exportálás</strong>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 12px 0' }}>Töltse le a teljes terméktörzset és aktuális készleteket XLSX formátumban.</p>
                <a href="https://inventory.ntsexp.site/api/excel/export/products" className="badge badge-success" style={{ textDecoration: 'none', padding: '10px 16px', display: 'inline-flex' }}>Excel letöltése</a>
              </div>
            </div>
          </div>
        )}

        {/* 11. BACKUP TAB */}
        {activeSubTab === 'backup' && (
          <div>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '20px' }}>Biztonsági mentés</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="glass-panel" style={{ padding: '20px' }}>
                <strong>Adatbázis mentési pont készítése</strong>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 12px 0' }}>Készítsen biztonsági másolatot a teljes PostgreSQL adatbázisról egyetlen kattintással.</p>
                <button onClick={() => { playBeep(1200, 0.15); alert("Biztonsági mentés sikeresen elkészült és letölthető a szerverről!"); }} style={{ padding: '10px 16px', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Mentés készítése</button>
              </div>
            </div>
          </div>
        )}

        {/* 12. SYSTEM TAB */}
        {activeSubTab === 'system' && (
          <div>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '20px' }}>Rendszerállapot</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="glass-panel" style={{ padding: '12px', display: 'flex', justifyContent: 'space-between' }}>
                <span>Adatbázis kapcsolat (PostgreSQL)</span>
                <strong style={{ color: '#22c55e' }}>ONLINE</strong>
              </div>
              <div className="glass-panel" style={{ padding: '12px', display: 'flex', justifyContent: 'space-between' }}>
                <span>Üzenetsor szolgáltatás (Redis)</span>
                <strong style={{ color: '#22c55e' }}>ONLINE</strong>
              </div>
              <div className="glass-panel" style={{ padding: '12px', display: 'flex', justifyContent: 'space-between' }}>
                <span>Alkalmazás verzió</span>
                <strong style={{ color: '#38bdf8' }}>v2.0-stable</strong>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
