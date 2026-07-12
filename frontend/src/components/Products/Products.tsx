import React, { useState, useEffect, useRef } from 'react';
import { Plus, FileSpreadsheet, X, ChevronDown, Check, Trash2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import { API_BASE } from '../../config';

const formatHUF = (value: number) => {
  return new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(value);
};

interface ProductsProps {
  token: string | null;
  products: any[];
  categories: any[];
  locations: any[];
  suppliers: any[];
  fetchData: () => void;
}

export default function Products({ token, products, categories, locations, suppliers, fetchData }: ProductsProps) {
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdSku, setNewProdSku] = useState('');
  const [newProdBarcode, setNewProdBarcode] = useState('');
  
  // Price and VAT States
  const [priceNetStr, setPriceNetStr] = useState('0');
  const [priceGrossStr, setPriceGrossStr] = useState('0');
  const [saleNetStr, setSaleNetStr] = useState('0');
  const [saleGrossStr, setSaleGrossStr] = useState('0');
  const [newProdVatRate, setNewProdVatRate] = useState('27');
  
  // Authoritative tracking states
  const [lastEditedPurchase, setLastEditedPurchase] = useState<'net' | 'gross' | null>(null);
  const [lastEditedSale, setLastEditedSale] = useState<'net' | 'gross' | null>(null);

  // Selector states
  const [newProdLocation, setNewProdLocation] = useState('');
  const [newProdCategory, setNewProdCategory] = useState('');
  const [newProdSupplier, setNewProdSupplier] = useState('');

  // Inline Creation Modals
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [quickCatName, setQuickCatName] = useState('');

  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);
  const [quickSupName, setQuickSupName] = useState('');
  const [quickSupContact, setQuickSupContact] = useState('');
  const [quickSupEmail, setQuickSupEmail] = useState('');
  const [quickSupPhone, setQuickSupPhone] = useState('');

  // Combobox Search States
  const [catSearch, setCatSearch] = useState('');
  const [showCatDropdown, setShowCatDropdown] = useState(false);
  const [supSearch, setSupSearch] = useState('');
  const [showSupDropdown, setShowSupDropdown] = useState(false);

  const catRef = useRef<HTMLDivElement>(null);
  const supRef = useRef<HTMLDivElement>(null);

  // Edit Product States
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [editName, setEditName] = useState('');
  const [editSku, setEditSku] = useState('');
  const [editBarcode, setEditBarcode] = useState('');
  const [editEan, setEditEan] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editSupplier, setEditSupplier] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editUnit, setEditUnit] = useState('db');
  const [editVatRate, setEditVatRate] = useState('27');
  const [editPriceNetStr, setEditPriceNetStr] = useState('0');
  const [editPriceGrossStr, setEditPriceGrossStr] = useState('0');
  const [editSaleNetStr, setEditSaleNetStr] = useState('0');
  const [editSaleGrossStr, setEditSaleGrossStr] = useState('0');
  const [editMinStock, setEditMinStock] = useState('0');
  const [editCurrentStock, setEditCurrentStock] = useState('0');
  const [editTrackStock, setEditTrackStock] = useState(true);
  const [editAllowNegative, setEditAllowNegative] = useState(false);
  const [editSerialTracking, setEditSerialTracking] = useState(false);

  const [editCatSearch, setEditCatSearch] = useState('');
  const [showEditCatDropdown, setShowEditCatDropdown] = useState(false);
  const [editSupSearch, setEditSupSearch] = useState('');
  const [showEditSupDropdown, setShowEditSupDropdown] = useState(false);

  const editCatRef = useRef<HTMLDivElement>(null);
  const editSupRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (catRef.current && !catRef.current.contains(e.target as Node)) {
        setShowCatDropdown(false);
      }
      if (supRef.current && !supRef.current.contains(e.target as Node)) {
        setShowSupDropdown(false);
      }
      if (editCatRef.current && !editCatRef.current.contains(e.target as Node)) {
        setShowEditCatDropdown(false);
      }
      if (editSupRef.current && !editSupRef.current.contains(e.target as Node)) {
        setShowEditSupDropdown(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const getVatMultiplier = (vat: string) => {
    if (vat === 'AAM' || vat === 'TAM') return 1;
    const v = parseFloat(vat) || 0;
    return 1 + (v / 100);
  };

  const handlePriceNetChange = (valStr: string, vat: string) => {
    setPriceNetStr(valStr);
    setLastEditedPurchase('net');
    const num = parseFloat(valStr) || 0;
    const mult = getVatMultiplier(vat);
    setPriceGrossStr(Math.round(num * mult).toString());
  };

  const handlePriceGrossChange = (valStr: string, vat: string) => {
    setPriceGrossStr(valStr);
    setLastEditedPurchase('gross');
    const num = parseFloat(valStr) || 0;
    const mult = getVatMultiplier(vat);
    setPriceNetStr(Math.round(num / mult).toString());
  };

  const handleSaleNetChange = (valStr: string, vat: string) => {
    setSaleNetStr(valStr);
    setLastEditedSale('net');
    const num = parseFloat(valStr) || 0;
    const mult = getVatMultiplier(vat);
    setSaleGrossStr(Math.round(num * mult).toString());
  };

  const handleSaleGrossChange = (valStr: string, vat: string) => {
    setSaleGrossStr(valStr);
    setLastEditedSale('gross');
    const num = parseFloat(valStr) || 0;
    const mult = getVatMultiplier(vat);
    setSaleNetStr(Math.round(num / mult).toString());
  };

  const handleVatChange = (vat: string) => {
    setNewProdVatRate(vat);
    const mult = getVatMultiplier(vat);
    if (lastEditedPurchase === 'net') {
      const num = parseFloat(priceNetStr) || 0;
      setPriceGrossStr(Math.round(num * mult).toString());
    } else if (lastEditedPurchase === 'gross') {
      const num = parseFloat(priceGrossStr) || 0;
      setPriceNetStr(Math.round(num / mult).toString());
    }
    if (lastEditedSale === 'net') {
      const num = parseFloat(saleNetStr) || 0;
      setSaleGrossStr(Math.round(num * mult).toString());
    } else if (lastEditedSale === 'gross') {
      const num = parseFloat(saleGrossStr) || 0;
      setSaleNetStr(Math.round(num / mult).toString());
    }
  };

  const generateNewBarcode = async () => {
    try {
      const response = await fetch(`${API_BASE}/products/generate-barcode`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setNewProdBarcode(data.barcode);
    } catch (err) {
      alert("Hiba a vonalkód generálásakor");
    }
  };

  // Inline Quick Add Category
  const handleQuickAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCatName.trim()) return;

    try {
      const response = await fetch(`${API_BASE}/categories`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: quickCatName })
      });
      if (response.ok) {
        const newCat = await response.json();
        fetchData();
        setNewProdCategory(newCat.id);
        setCatSearch(newCat.name);
        setQuickCatName('');
        setShowAddCategoryModal(false);
      } else {
        const err = await response.json();
        alert(`Hiba: ${err.detail}`);
      }
    } catch (err) {
      alert("Hálózat hiba");
    }
  };

  // Inline Quick Add Supplier
  const handleQuickAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickSupName.trim()) return;

    try {
      const response = await fetch(`${API_BASE}/suppliers`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: quickSupName,
          contact_person: quickSupContact,
          email: quickSupEmail,
          phone: quickSupPhone
        })
      });
      if (response.ok) {
        const newSup = await response.json();
        fetchData();
        setNewProdSupplier(newSup.id);
        setSupSearch(newSup.name);
        setQuickSupName('');
        setQuickSupContact('');
        setQuickSupEmail('');
        setQuickSupPhone('');
        setShowAddSupplierModal(false);
      } else {
        const err = await response.json();
        alert(`Hiba: ${err.detail}`);
      }
    } catch (err) {
      alert("Hálózat hiba");
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Backend expects integer VAT rate. AAM/TAM are sent as 0.
      let vatInt = 0;
      if (newProdVatRate !== 'AAM' && newProdVatRate !== 'TAM') {
        vatInt = parseInt(newProdVatRate) || 0;
      }

      const response = await fetch(`${API_BASE}/products`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: newProdName,
          barcode: newProdBarcode || null,
          sku: newProdSku || null,
          purchase_price_net: parseInt(priceNetStr) || 0,
          purchase_price_gross: parseInt(priceGrossStr) || 0,
          sale_price_net: parseInt(saleNetStr) || 0,
          sale_price_gross: parseInt(saleGrossStr) || 0,
          vat_rate: vatInt,
          category_id: newProdCategory || null,
          supplier_id: newProdSupplier || null,
          default_location_id: newProdLocation || null
        })
      });
      if (response.ok) {
        confetti();
        setShowAddProduct(false);
        fetchData();
        
        // Reset states
        setNewProdName('');
        setNewProdSku('');
        setNewProdBarcode('');
        setPriceNetStr('0');
        setPriceGrossStr('0');
        setSaleNetStr('0');
        setSaleGrossStr('0');
        setNewProdVatRate('27');
        setLastEditedPurchase(null);
        setLastEditedSale(null);
        setNewProdCategory('');
        setNewProdSupplier('');
        setNewProdLocation('');
        setCatSearch('');
        setSupSearch('');
      } else {
        const err = await response.json();
        alert(`Hiba termék létrehozása során: ${err.detail}`);
      }
    } catch (err) {
      alert("Hálózati hiba");
    }
  };

  const handleEditPriceNetChange = (valStr: string, vat: string) => {
    setEditPriceNetStr(valStr);
    const num = parseFloat(valStr) || 0;
    const mult = getVatMultiplier(vat);
    setEditPriceGrossStr(Math.round(num * mult).toString());
  };

  const handleEditPriceGrossChange = (valStr: string, vat: string) => {
    setEditPriceGrossStr(valStr);
    const num = parseFloat(valStr) || 0;
    const mult = getVatMultiplier(vat);
    setEditPriceNetStr(Math.round(num / mult).toString());
  };

  const handleEditSaleNetChange = (valStr: string, vat: string) => {
    setEditSaleNetStr(valStr);
    const num = parseFloat(valStr) || 0;
    const mult = getVatMultiplier(vat);
    setEditSaleGrossStr(Math.round(num * mult).toString());
  };

  const handleEditSaleGrossChange = (valStr: string, vat: string) => {
    setEditSaleGrossStr(valStr);
    const num = parseFloat(valStr) || 0;
    const mult = getVatMultiplier(vat);
    setEditSaleNetStr(Math.round(num / mult).toString());
  };

  const handleStartEdit = (p: any) => {
    setEditingProduct(p);
    setEditName(p.name);
    setEditSku(p.sku || '');
    setEditBarcode(p.barcode || '');
    setEditEan(p.ean || '');
    setEditDescription(p.description || '');
    setEditCategory(p.category_id || '');
    setEditSupplier(p.supplier_id || '');
    setEditLocation(p.default_location_id || '');
    setEditUnit(p.unit || 'db');
    setEditVatRate(p.vat_rate?.toString() || '27');
    setEditPriceNetStr(p.purchase_price_net?.toString() || '0');
    setEditPriceGrossStr(p.purchase_price_gross?.toString() || '0');
    setEditSaleNetStr(p.sale_price_net?.toString() || '0');
    setEditSaleGrossStr(p.sale_price_gross?.toString() || '0');
    setEditMinStock(p.minimum_stock?.toString() || '0');
    setEditCurrentStock(p.current_stock?.toString() || '0');
    setEditTrackStock(p.track_stock);
    setEditAllowNegative(p.allow_negative_stock);
    setEditSerialTracking(p.serial_number_tracking);

    const cat = categories.find(c => c.id === p.category_id);
    setEditCatSearch(cat ? cat.name : '');
    const sup = suppliers.find(s => s.id === p.supplier_id);
    setEditSupSearch(sup ? sup.name : '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let vatInt = 0;
      if (editVatRate !== 'AAM' && editVatRate !== 'TAM') {
        vatInt = parseInt(editVatRate) || 0;
      }

      const response = await fetch(`${API_BASE}/products/${editingProduct.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: editName,
          barcode: editBarcode,
          ean: editEan || null,
          description: editDescription,
          sku: editSku || null,
          category_id: editCategory || null,
          supplier_id: editSupplier || null,
          default_location_id: editLocation || null,
          unit: editUnit,
          vat_rate: vatInt,
          purchase_price_net: parseInt(editPriceNetStr) || 0,
          purchase_price_gross: parseInt(editPriceGrossStr) || 0,
          sale_price_net: parseInt(editSaleNetStr) || 0,
          sale_price_gross: parseInt(editSaleGrossStr) || 0,
          minimum_stock: parseInt(editMinStock) || 0,
          current_stock: parseInt(editCurrentStock) || 0,
          track_stock: editTrackStock,
          allow_negative_stock: editAllowNegative,
          serial_number_tracking: editSerialTracking
        })
      });

      if (response.ok) {
        setEditingProduct(null);
        fetchData();
      } else {
        const err = await response.json();
        alert(`Hiba termék módosítása során: ${err.detail}`);
      }
    } catch (err) {
      alert("Hálózati hiba a mentés során.");
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    const confirmDelete = window.confirm("Biztosan törölni szeretné ezt a terméket és minden kapcsolódó mozgását?");
    if (!confirmDelete) return;

    try {
      const response = await fetch(`${API_BASE}/products/${productId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        fetchData();
      } else {
        const err = await response.json();
        alert(`Hiba termék törlése során: ${err.detail}`);
      }
    } catch (err) {
      alert("Hálózati hiba a törlés során.");
    }
  };

  const handleDeleteZeroStock = async () => {
    const confirmDelete = window.confirm(
      "Biztosan törölni szeretné az összes terméket, aminek 0 a készlete? Ez a művelet nem vonható vissza!"
    );
    if (!confirmDelete) return;

    try {
      const response = await fetch(`${API_BASE}/products/delete-zero-stock`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        alert(result.message);
        fetchData();
      } else {
        const err = await response.json();
        alert(`Hiba: ${err.detail}`);
      }
    } catch (err) {
      alert("Hálózati hiba a törlés során.");
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', margin: 0 }}>Termék Törzsadatok</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={handleDeleteZeroStock} 
            style={{ 
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', 
              backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', 
              border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '6px', 
              cursor: 'pointer', fontWeight: 'bold' 
            }}
          >
            <Trash2 size={16} /> Nullás készletek törlése
          </button>
          <a href="https://inventory.ntsexp.site/api/excel/export/products" className="badge badge-success" style={{ textDecoration: 'none', padding: '10px 16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <FileSpreadsheet size={16} /> Excel exportálás
          </a>
          <button onClick={() => setShowAddProduct(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
            <Plus size={16} /> Új termék hozzáadása
          </button>
        </div>
      </div>

      {showAddProduct && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', zIndex: 100, overflowY: 'auto', padding: '40px 20px' }}>
          <form onSubmit={handleCreateProduct} className="glass-panel" style={{ padding: '24px', width: '600px', display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'visible' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Új termék felvitele</h3>
              <button type="button" onClick={() => setShowAddProduct(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Termék név *</label>
                <input type="text" value={newProdName} onChange={e => setNewProdName(e.target.value)} required style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Cikkszám (SKU)</label>
                <input type="text" value={newProdSku} onChange={e => setNewProdSku(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', alignItems: 'end' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Belső vonalkód (Opcionális)</label>
                <input type="text" value={newProdBarcode} onChange={e => setNewProdBarcode(e.target.value)} placeholder="Üresen hagyva automatikus 6-karakteres kód" style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} />
              </div>
              <button type="button" onClick={generateNewBarcode} style={{ padding: '8px 12px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#38bdf8', borderRadius: '6px', cursor: 'pointer' }}>Generálás</button>
            </div>

            {/* VAT Rate Dropdown */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>ÁFA Kulcs *</label>
              <select 
                value={newProdVatRate} 
                onChange={e => handleVatChange(e.target.value)}
                style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px' }}
              >
                <option value="27">27%</option>
                <option value="18">18%</option>
                <option value="5">5%</option>
                <option value="0">0%</option>
                <option value="AAM">AAM (ÁFA-alanyi mentes)</option>
                <option value="TAM">TAM (Tárgyi adómentes)</option>
              </select>
            </div>

            {/* Net and Gross Price Inputs (Bidirectional) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                  Nettó beszerzési ár (Ft)
                  {lastEditedPurchase === 'net' && <span title="Authoritative" style={{ color: '#38bdf8' }}>🔵</span>}
                </label>
                <input 
                  type="text" 
                  value={priceNetStr} 
                  onChange={e => handlePriceNetChange(e.target.value, newProdVatRate)} 
                  style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} 
                />
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                  Bruttó beszerzési ár (Ft)
                  {lastEditedPurchase === 'gross' && <span title="Authoritative" style={{ color: '#38bdf8' }}>🔵</span>}
                </label>
                <input 
                  type="text" 
                  value={priceGrossStr} 
                  onChange={e => handlePriceGrossChange(e.target.value, newProdVatRate)} 
                  style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} 
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                  Nettó eladási ár (Ft)
                  {lastEditedSale === 'net' && <span title="Authoritative" style={{ color: '#38bdf8' }}>🔵</span>}
                </label>
                <input 
                  type="text" 
                  value={saleNetStr} 
                  onChange={e => handleSaleNetChange(e.target.value, newProdVatRate)} 
                  style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} 
                />
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                  Bruttó eladási ár (Ft)
                  {lastEditedSale === 'gross' && <span title="Authoritative" style={{ color: '#38bdf8' }}>🔵</span>}
                </label>
                <input 
                  type="text" 
                  value={saleGrossStr} 
                  onChange={e => handleSaleGrossChange(e.target.value, newProdVatRate)} 
                  style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} 
                />
              </div>
            </div>

            {/* Default Location selector */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Alapértelmezett raktárhely</label>
              <select value={newProdLocation} onChange={e => setNewProdLocation(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px' }}>
                <option value="">Válasszon...</option>
                {locations.filter(l => !l.is_archived).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>

            {/* Categories & Suppliers: Searchable Comboboxes & inline buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              
              {/* Category Searchable Autocomplete Combobox */}
              <div ref={catRef} style={{ position: 'relative' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Kategória</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input 
                      type="text" 
                      value={catSearch}
                      onChange={e => {
                        setCatSearch(e.target.value);
                        setShowCatDropdown(true);
                      }}
                      onFocus={() => setShowCatDropdown(true)}
                      placeholder="Keressen kategóriát..."
                      style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px' }}
                    />
                    <ChevronDown size={16} style={{ position: 'absolute', right: '10px', top: '10px', color: '#64748b', pointerEvents: 'none' }} />
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setShowAddCategoryModal(true)} 
                    style={{ padding: '8px 12px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#38bdf8', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    + Új
                  </button>
                </div>

                {showCatDropdown && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#0f172a',
                    border: '1px solid #1e293b', borderRadius: '6px', zIndex: 110, maxHeight: '180px', overflowY: 'auto',
                    boxShadow: '0 8px 16px rgba(0,0,0,0.5)', marginTop: '4px'
                  }}>
                    <div 
                      onClick={() => {
                        setNewProdCategory('');
                        setCatSearch('');
                        setShowCatDropdown(false);
                      }}
                      style={{ padding: '8px 12px', cursor: 'pointer', color: '#64748b' }}
                      className="search-item-hover"
                    >
                      (Nincs kategória)
                    </div>
                    {categories.filter(c => !c.is_archived && c.name.toLowerCase().includes(catSearch.toLowerCase())).map(c => (
                      <div 
                        key={c.id} 
                        onClick={() => {
                          setNewProdCategory(c.id);
                          setCatSearch(c.name);
                          setShowCatDropdown(false);
                        }}
                        style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        className="search-item-hover"
                      >
                        <span>{c.name}</span>
                        {newProdCategory === c.id && <Check size={14} style={{ color: '#0284c7' }} />}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Supplier Searchable Autocomplete Combobox */}
              <div ref={supRef} style={{ position: 'relative' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Beszállító</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input 
                      type="text" 
                      value={supSearch}
                      onChange={e => {
                        setSupSearch(e.target.value);
                        setShowSupDropdown(true);
                      }}
                      onFocus={() => setShowSupDropdown(true)}
                      placeholder="Keressen beszállítót..."
                      style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px' }}
                    />
                    <ChevronDown size={16} style={{ position: 'absolute', right: '10px', top: '10px', color: '#64748b', pointerEvents: 'none' }} />
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setShowAddSupplierModal(true)} 
                    style={{ padding: '8px 12px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#38bdf8', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    + Új
                  </button>
                </div>

                {showSupDropdown && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#0f172a',
                    border: '1px solid #1e293b', borderRadius: '6px', zIndex: 110, maxHeight: '180px', overflowY: 'auto',
                    boxShadow: '0 8px 16px rgba(0,0,0,0.5)', marginTop: '4px'
                  }}>
                    <div 
                      onClick={() => {
                        setNewProdSupplier('');
                        setSupSearch('');
                        setShowSupDropdown(false);
                      }}
                      style={{ padding: '8px 12px', cursor: 'pointer', color: '#64748b' }}
                      className="search-item-hover"
                    >
                      (Nincs beszállító)
                    </div>
                    {suppliers.filter(s => !s.is_archived && s.is_active && s.name.toLowerCase().includes(supSearch.toLowerCase())).map(s => (
                      <div 
                        key={s.id} 
                        onClick={() => {
                          setNewProdSupplier(s.id);
                          setSupSearch(s.name);
                          setShowSupDropdown(false);
                        }}
                        style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        className="search-item-hover"
                      >
                        <span>{s.name}</span>
                        {newProdSupplier === s.id && <Check size={14} style={{ color: '#0284c7' }} />}
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            <button type="submit" style={{ width: '100%', padding: '12px', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', marginTop: '12px' }}>Termék mentése</button>
          </form>
        </div>
      )}

      {editingProduct && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', zIndex: 100, overflowY: 'auto', padding: '40px 20px' }}>
          <form onSubmit={handleSaveEdit} className="glass-panel" style={{ padding: '24px', width: '600px', display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'visible' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Termék szerkesztése: {editingProduct.name}</h3>
              <button type="button" onClick={() => setEditingProduct(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Termék név *</label>
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)} required style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Cikkszám (SKU)</label>
                <input type="text" value={editSku} onChange={e => setEditSku(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Belső vonalkód</label>
                <input type="text" value={editBarcode} onChange={e => setEditBarcode(e.target.value)} required style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Gyártói EAN</label>
                <input type="text" value={editEan} onChange={e => setEditEan(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Leírás</label>
              <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', minHeight: '60px', boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Mennyiségi egység</label>
                <input type="text" value={editUnit} onChange={e => setEditUnit(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>ÁFA kulcs</label>
                <select value={editVatRate} onChange={e => setEditVatRate(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px' }}>
                  <option value="27">27%</option>
                  <option value="18">18%</option>
                  <option value="5">5%</option>
                  <option value="AAM">AAM (0%)</option>
                  <option value="TAM">TAM (0%)</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Figyelmeztetési készletszint</label>
                <input type="number" value={editMinStock} onChange={e => setEditMinStock(e.target.value)} min="0" style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Aktuális készlet (Darab) *</label>
                <input type="number" value={editCurrentStock} onChange={e => setEditCurrentStock(Math.max(0, parseInt(e.target.value) || 0).toString())} min="0" required style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #ef4444', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box', fontWeight: 'bold' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Alapértelmezett raktárhely</label>
                <select value={editLocation} onChange={e => setEditLocation(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px' }}>
                  <option value="">Válasszon...</option>
                  {locations.filter(l => !l.is_archived).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Nettó beszerzési ár (Ft)</label>
                <input type="text" value={editPriceNetStr} onChange={e => handleEditPriceNetChange(e.target.value, editVatRate)} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Bruttó beszerzési ár (Ft)</label>
                <input type="text" value={editPriceGrossStr} onChange={e => handleEditPriceGrossChange(e.target.value, editVatRate)} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Nettó eladási ár (Ft)</label>
                <input type="text" value={editSaleNetStr} onChange={e => handleEditSaleNetChange(e.target.value, editVatRate)} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Bruttó eladási ár (Ft)</label>
                <input type="text" value={editSaleGrossStr} onChange={e => handleEditSaleGrossChange(e.target.value, editVatRate)} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px', boxSizing: 'border-box' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              
              {/* Edit Category Autocomplete Combobox */}
              <div ref={editCatRef} style={{ position: 'relative' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Kategória</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input 
                      type="text" 
                      value={editCatSearch}
                      onChange={e => {
                        setEditCatSearch(e.target.value);
                        setShowEditCatDropdown(true);
                      }}
                      onFocus={() => setShowEditCatDropdown(true)}
                      placeholder="Keressen kategóriát..."
                      style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px' }}
                    />
                    <ChevronDown size={16} style={{ position: 'absolute', right: '10px', top: '10px', color: '#64748b', pointerEvents: 'none' }} />
                  </div>
                </div>

                {showEditCatDropdown && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#0f172a',
                    border: '1px solid #1e293b', borderRadius: '6px', zIndex: 110, maxHeight: '180px', overflowY: 'auto',
                    boxShadow: '0 8px 16px rgba(0,0,0,0.5)', marginTop: '4px'
                  }}>
                    <div 
                      onClick={() => {
                        setEditCategory('');
                        setEditCatSearch('');
                        setShowEditCatDropdown(false);
                      }}
                      style={{ padding: '8px 12px', cursor: 'pointer', color: '#64748b' }}
                      className="search-item-hover"
                    >
                      (Nincs kategória)
                    </div>
                    {categories.filter(c => !c.is_archived && c.name.toLowerCase().includes(editCatSearch.toLowerCase())).map(c => (
                      <div 
                        key={c.id} 
                        onClick={() => {
                          setEditCategory(c.id);
                          setEditCatSearch(c.name);
                          setShowEditCatDropdown(false);
                        }}
                        style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        className="search-item-hover"
                      >
                        <span>{c.name}</span>
                        {editCategory === c.id && <Check size={14} style={{ color: '#0284c7' }} />}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Edit Supplier Autocomplete Combobox */}
              <div ref={editSupRef} style={{ position: 'relative' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Beszállító</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input 
                      type="text" 
                      value={editSupSearch}
                      onChange={e => {
                        setEditSupSearch(e.target.value);
                        setShowEditSupDropdown(true);
                      }}
                      onFocus={() => setShowEditSupDropdown(true)}
                      placeholder="Keressen beszállítót..."
                      style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px' }}
                    />
                    <ChevronDown size={16} style={{ position: 'absolute', right: '10px', top: '10px', color: '#64748b', pointerEvents: 'none' }} />
                  </div>
                </div>

                {showEditSupDropdown && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#0f172a',
                    border: '1px solid #1e293b', borderRadius: '6px', zIndex: 110, maxHeight: '180px', overflowY: 'auto',
                    boxShadow: '0 8px 16px rgba(0,0,0,0.5)', marginTop: '4px'
                  }}>
                    <div 
                      onClick={() => {
                        setEditSupplier('');
                        setEditSupSearch('');
                        setShowEditSupDropdown(false);
                      }}
                      style={{ padding: '8px 12px', cursor: 'pointer', color: '#64748b' }}
                      className="search-item-hover"
                    >
                      (Nincs beszállító)
                    </div>
                    {suppliers.filter(s => !s.is_archived && s.is_active && s.name.toLowerCase().includes(editSupSearch.toLowerCase())).map(s => (
                      <div 
                        key={s.id} 
                        onClick={() => {
                          setEditSupplier(s.id);
                          setEditSupSearch(s.name);
                          setShowEditSupDropdown(false);
                        }}
                        style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        className="search-item-hover"
                      >
                        <span>{s.name}</span>
                        {editSupplier === s.id && <Check size={14} style={{ color: '#0284c7' }} />}
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            <button type="submit" style={{ width: '100%', padding: '12px', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', marginTop: '12px' }}>Változtatások mentése</button>
          </form>
        </div>
      )}

      {/* Inline Quick Add Category Modal */}
      {showAddCategoryModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 150 }}>
          <form onSubmit={handleQuickAddCategory} className="glass-panel" style={{ padding: '24px', width: '400px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0 }}>Új kategória felvétele</h3>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Kategória neve</label>
              <input type="text" value={quickCatName} onChange={e => setQuickCatName(e.target.value)} required style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px' }} />
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button type="submit" style={{ flex: 1, padding: '10px', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Létrehozás</button>
              <button type="button" onClick={() => setShowAddCategoryModal(false)} style={{ flex: 1, padding: '10px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#cbd5e1', borderRadius: '6px', cursor: 'pointer' }}>Mégse</button>
            </div>
          </form>
        </div>
      )}

      {/* Inline Quick Add Supplier Modal */}
      {showAddSupplierModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 150 }}>
          <form onSubmit={handleQuickAddSupplier} className="glass-panel" style={{ padding: '24px', width: '400px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0 }}>Új beszállító felvétele</h3>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Beszállító neve *</label>
              <input type="text" value={quickSupName} onChange={e => setQuickSupName(e.target.value)} required style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Kapcsolattartó</label>
              <input type="text" value={quickSupContact} onChange={e => setQuickSupContact(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>E-mail</label>
              <input type="email" value={quickSupEmail} onChange={e => setQuickSupEmail(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Telefonszám</label>
              <input type="text" value={quickSupPhone} onChange={e => setQuickSupPhone(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '6px' }} />
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button type="submit" style={{ flex: 1, padding: '10px', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Létrehozás</button>
              <button type="button" onClick={() => setShowAddSupplierModal(false)} style={{ flex: 1, padding: '10px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#cbd5e1', borderRadius: '6px', cursor: 'pointer' }}>Mégse</button>
            </div>
          </form>
        </div>
      )}

      <div className="table-container">
        <table className="dense-table">
          <thead>
            <tr>
              <th>Belső kód</th>
              <th>Cikkszám (SKU)</th>
              <th>Termék név</th>
              <th>Egység</th>
              <th>Beszerzési ár (Nettó)</th>
              <th>Eladási ár (Bruttó)</th>
              <th>Készlet</th>
              <th>Állapot</th>
              <th>Műveletek</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', color: '#64748b' }}>Nincs megjeleníthető termék.</td>
              </tr>
            ) : (
              products.map(p => (
                <tr key={p.id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#38bdf8' }}>{p.barcode}</td>
                  <td>{p.sku || '-'}</td>
                  <td style={{ fontWeight: '500' }}>{p.name}</td>
                  <td>{p.unit}</td>
                  <td>{formatHUF(p.purchase_price_net)}</td>
                  <td>{formatHUF(p.sale_price_gross)}</td>
                  <td style={{ fontWeight: 'bold', color: p.current_stock <= p.minimum_stock ? '#ef4444' : '#22c55e' }}>{p.current_stock} db</td>
                  <td>
                    {p.is_active ? (
                      <span className="badge badge-success">Aktív</span>
                    ) : (
                      <span className="badge badge-danger">Inaktív</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        onClick={() => handleStartEdit(p)} 
                        style={{ padding: '4px 8px', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                      >
                        Szerkesztés
                      </button>
                      <button 
                        onClick={() => handleDeleteProduct(p.id)} 
                        style={{ padding: '4px 8px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                      >
                        Törlés
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
