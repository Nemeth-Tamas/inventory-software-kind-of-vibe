import { useState, useEffect } from 'react';
import Sidebar from './components/Common/Sidebar';
import Header from './components/Common/Header';
import CommandPalette from './components/Common/CommandPalette';
import Login from './components/Auth/Login';
import ForcePasswordChange from './components/Auth/ForcePasswordChange';
import Dashboard from './components/Dashboard/Dashboard';
import Products from './components/Products/Products';
import Receipt from './components/Receipt/Receipt';
import Issue from './components/Issue/Issue';
import Stocktake from './components/Stocktake/Stocktake';
import Billingo from './components/Billingo/Billingo';
import AuditLogs from './components/Audit/AuditLogs';
import Settings from './components/Settings/Settings';
import OpeningStock from './components/OpeningStock/OpeningStock';

import { API_BASE } from './config';

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  
  // Master lists
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [stocktakes, setStocktakes] = useState<any[]>([]);
  
  // Real-time Event Log (SSE)
  const [sseStatus, setSseStatus] = useState<string>('Kapcsolódás...');
  const [sseEvents, setSseEvents] = useState<string[]>([]);
  
  // Scanner state
  const [scanStatus, setScanStatus] = useState<string>('Vonalkódolvasó kész');
  const [lastScannedBarcode, setLastScannedBarcode] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  
  // UI Dialog overlays
  const [authError, setAuthError] = useState('');
  
  // Bevételezés (Goods Receipt) State
  const [receiptCart, setReceiptCart] = useState<any[]>([]);
  const [receiptLocation, setReceiptLocation] = useState('');
  const [receiptRef, setReceiptRef] = useState('');
  
  // Kiadás (Stock Issue) State
  const [issueCart, setIssueCart] = useState<any[]>([]);
  const [issueLocation, setIssueLocation] = useState('');
  const [issueReason, setIssueReason] = useState('Eladás');
  const [issueRef, setIssueRef] = useState('');

  // Leltár (Stocktake) State
  const [activeStocktake, setActiveStocktake] = useState<any>(null);
  const [stocktakeItems, setStocktakeItems] = useState<any[]>([]);

  // Billingo Status
  const [billingoStatus, setBillingoStatus] = useState<any>(null);

  // Keyboard Command Palette
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  // Play audio feed helper
  const playBeep = (freq = 1000, duration = 0.1, volume = 0.04) => {
    if (!soundEnabled) return;
    try {
      const context = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = context.createOscillator();
      const gainNode = context.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, context.currentTime);
      
      gainNode.gain.setValueAtTime(volume, context.currentTime);
      
      osc.connect(gainNode);
      gainNode.connect(context.destination);
      
      osc.start();
      osc.stop(context.currentTime + duration);
    } catch (err) {
      console.warn("Audio Context blocked or unsupported");
    }
  };

  // Fetch Master Data
  const fetchData = async () => {
    if (!token) return;
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [resProd, resCat, resLoc, resSup, resMov, resLogs, resSt] = await Promise.all([
        fetch(`${API_BASE}/products?all=true`, { headers }),
        fetch(`${API_BASE}/categories`, { headers }),
        fetch(`${API_BASE}/locations`, { headers }),
        fetch(`${API_BASE}/suppliers`, { headers }),
        fetch(`${API_BASE}/inventory/movements`, { headers }),
        fetch(`${API_BASE}/audit`, { headers }),
        fetch(`${API_BASE}/stocktakes`, { headers })
      ]);
      
      if (resProd.status === 412 || resCat.status === 412) {
        setMustChangePassword(true);
        return;
      }
      
      if (resProd.ok) setProducts(await resProd.json());
      if (resCat.ok) setCategories(await resCat.json());
      if (resLoc.ok) setLocations(await resLoc.json());
      if (resSup.ok) setSuppliers(await resSup.json());
      if (resMov.ok) setMovements(await resMov.json());
      if (resLogs.ok) setAuditLogs(await resLogs.json());
      if (resSt.ok) setStocktakes(await resSt.json());
    } catch (err) {
      console.error("Hiba az adatok letöltésekor", err);
    }
  };

  // Auth Status & Refresh
  useEffect(() => {
    if (token) {
      fetch(`${API_BASE}/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => {
        if (res.status === 412) {
          setMustChangePassword(true);
          throw new Error("Must change password");
        }
        if (res.ok) return res.json();
        throw new Error("Expired");
      })
      .then(data => {
        setCurrentUser(data);
        setMustChangePassword(false);
        fetchData();
      })
      .catch((err) => {
        if (err.message !== "Must change password") {
          setToken(null);
          localStorage.removeItem('token');
        }
      });
    }
  }, [token]);

  // Server-Sent Events (SSE) Live Connection
  useEffect(() => {
    if (!token || mustChangePassword) return;
    
    setSseStatus('Kapcsolódás...');
    const eventSource = new EventSource(`${API_BASE}/events`);
    
    eventSource.onopen = () => {
      setSseStatus('Online');
    };
    
    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        setSseEvents(prev => [`[${new Date().toLocaleTimeString('hu-HU')}] ${payload.type}: ${JSON.stringify(payload.data)}`, ...prev]);
        playBeep(800, 0.05);
        fetchData(); // Hot reload data on updates
      } catch (err) {
        console.error("SSE parse error", err);
      }
    };
    
    eventSource.onerror = () => {
      setSseStatus('Kapcsolat megszakadt');
    };
    
    return () => {
      eventSource.close();
    };
  }, [token, mustChangePassword]);

  // Global Barcode Scanner Event Detection
  useEffect(() => {
    if (!token || mustChangePassword) return;
    
    const SCAN_THRESHOLD = 80;
    const SCAN_TIMEOUT = 250;
    let buffer = '';
    let lastKeyTime = 0;
    let resetTimer: any;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl) {
        const type = activeEl.getAttribute('type');
        const tagName = activeEl.tagName.toLowerCase();
        if (type === 'password' || tagName === 'textarea' || (tagName === 'input' && type !== 'checkbox')) {
          return; // Ignore typing in input fields
        }
      }

      const currentTime = performance.now();
      const char = e.key;
      
      const isHex = /^[0-9a-fA-F]$/.test(char);
      if (!isHex) return;

      if (buffer.length > 0 && (currentTime - lastKeyTime > SCAN_THRESHOLD)) {
        buffer = char.toUpperCase();
      } else {
        buffer += char.toUpperCase();
      }
      
      lastKeyTime = currentTime;
      setScanStatus('Beolvasás érzékelve...');

      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        buffer = '';
        setScanStatus('Vonalkódolvasó kész');
      }, SCAN_TIMEOUT);

      if (buffer.length === 6) {
        const scanned = buffer;
        buffer = '';
        clearTimeout(resetTimer);
        setLastScannedBarcode(scanned);
        setScanStatus('Sikeres beolvasás!');
        playBeep(1200, 0.15);
        
        handleScannedCode(scanned);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(resetTimer);
    };
  }, [token, mustChangePassword, activeTab, activeStocktake, receiptCart, issueCart, products]);

  // Handle scanned barcode depending on active view context
  const handleScannedCode = async (barcode: string) => {
    if (activeTab === 'receipt') {
      const product = products.find(p => p.barcode === barcode || p.ean === barcode);
      if (product) {
        setReceiptCart(prev => {
          const existing = prev.find(item => item.product_id === product.id);
          if (existing) {
            return prev.map(item => item.product_id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
          }
          return [...prev, { product_id: product.id, name: product.name, barcode: product.barcode, quantity: 1, price_net: product.purchase_price_net }];
        });
      } else {
        playBeep(400, 0.3);
        alert(`Ismeretlen vonalkód a bevételezéshez: ${barcode}. Hozzon létre új terméket először.`);
      }
    } else if (activeTab === 'issue') {
      const product = products.find(p => p.barcode === barcode || p.ean === barcode);
      if (product) {
        setIssueCart(prev => {
          const existing = prev.find(item => item.product_id === product.id);
          if (existing) {
            return prev.map(item => item.product_id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
          }
          return [...prev, { product_id: product.id, name: product.name, barcode: product.barcode, quantity: 1, stock: product.current_stock }];
        });
      } else {
        playBeep(400, 0.3);
        alert(`Ismeretlen vonalkód kiadáshoz: ${barcode}`);
      }
    } else if (activeTab === 'stocktake' && activeStocktake) {
      try {
        const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
        const response = await fetch(`${API_BASE}/stocktakes/${activeStocktake.id}/scan`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ barcode })
        });
        const data = await response.json();
        if (data.status === 'success') {
          // Increment locally to avoid latency wait
          setStocktakeItems(prev => prev.map(item => 
            item.barcode === barcode ? { ...item, counted: item.counted + 1, difference: item.counted + 1 - item.expected } : item
          ));
        } else if (data.status === 'unknown') {
          // Unknown barcode scanned - backend persisted it and returned it to the client
          playBeep(400, 0.3);
          alert(`Ismeretlen vonalkód leltározva és mentve: ${barcode}. Feloldásához használja a képernyő tetején lévő panelt!`);
          // Trigger hot reload of unresolved scans in active stocktake
          // Wait briefly for commit
          setTimeout(() => {
            fetchData();
            // Trigger refresh inside Stocktake component by firing a synthetic event or just calling refresh endpoints
            // Triggering refetch through activeStocktake reassignment (which triggers useEffect in Stocktake)
            setActiveStocktake((prev: any) => ({ ...prev }));
          }, 300);
        } else {
          playBeep(400, 0.3);
          alert(`Hiba a leltár beolvasásakor.`);
        }
      } catch (err) {
        console.error("Leltár szkennelés hiba", err);
      }
    }
  };

  // Keyboard Shortcuts Command Palette (Ctrl+K)
  useEffect(() => {
    const handlePaletteTrigger = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
      }
    };
    window.addEventListener('keydown', handlePaletteTrigger);
    return () => window.removeEventListener('keydown', handlePaletteTrigger);
  }, []);

  // Login handler
  const handleLoginSubmit = async (username: string, password: string) => {
    setAuthError('');
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username, password })
      });
      if (response.ok) {
        const data = await response.json();
        setToken(data.access_token);
        localStorage.setItem('token', data.access_token);
      } else {
        setAuthError('Hibás felhasználónév vagy jelszó!');
      }
    } catch (err) {
      setAuthError('Csatlakozási hiba a szerverrel.');
    }
  };

  // Logout handler
  const handleLogout = () => {
    setToken(null);
    setCurrentUser(null);
    setMustChangePassword(false);
    localStorage.removeItem('token');
  };

  // Test Billingo credentials
  const checkBillingo = async () => {
    setBillingoStatus({ status: "Kapcsolódás...", message: "", stock_sync_message: "" });
    try {
      const response = await fetch(`${API_BASE}/billingo/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setBillingoStatus(data);
    } catch (err) {
      setBillingoStatus({ status: "Hiba", message: "Nem sikerült lekérni a Billingo státuszt.", stock_sync_message: "" });
    }
  };

  // Render correct workspace tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard products={products} movements={movements} sseEvents={sseEvents} />;
      case 'products':
        return <Products token={token} categories={categories} locations={locations} suppliers={suppliers} fetchData={fetchData} />;
      case 'receipt':
        return (
          <Receipt 
            token={token} 
            receiptCart={receiptCart} 
            setReceiptCart={setReceiptCart} 
            receiptLocation={receiptLocation} 
            setReceiptLocation={setReceiptLocation} 
            receiptRef={receiptRef} 
            setReceiptRef={setReceiptRef} 
            locations={locations} 
            fetchData={fetchData} 
            products={products}
            playBeep={playBeep}
          />
        );
      case 'issue':
        return (
          <Issue 
            token={token} 
            issueCart={issueCart} 
            setIssueCart={setIssueCart} 
            issueLocation={issueLocation} 
            setIssueLocation={setIssueLocation} 
            issueReason={issueReason} 
            setIssueReason={setIssueReason} 
            issueRef={issueRef} 
            setIssueRef={setIssueRef} 
            locations={locations} 
            fetchData={fetchData} 
            products={products}
            playBeep={playBeep}
          />
        );
      case 'stocktake':
        return (
          <Stocktake 
            token={token} 
            stocktakes={stocktakes} 
            activeStocktake={activeStocktake} 
            setActiveStocktake={setActiveStocktake} 
            stocktakeItems={stocktakeItems} 
            setStocktakeItems={setStocktakeItems} 
            products={products}
            fetchData={fetchData} 
            playBeep={playBeep}
          />
        );
      case 'opening_stock':
        return (
          <OpeningStock 
            token={token}
            locations={locations}
            fetchData={fetchData}
            products={products}
            playBeep={playBeep}
          />
        );
      case 'billingo':
        return <Billingo token={token} billingoStatus={billingoStatus} checkBillingo={checkBillingo} fetchData={fetchData} />;
      case 'audit':
        return <AuditLogs auditLogs={auditLogs} />;
      case 'settings':
        return <Settings token={token} fetchData={fetchData} playBeep={playBeep} />;
      default:
        return <Dashboard products={products} movements={movements} sseEvents={sseEvents} />;
    }
  };

  if (!token) {
    return <Login handleLoginSubmit={handleLoginSubmit} authError={authError} />;
  }

  if (mustChangePassword) {
    return <ForcePasswordChange token={token} onPasswordChanged={() => { setMustChangePassword(false); handleLogout(); }} />;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#090d16', color: '#f8fafc' }}>
      
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        setActiveStocktake={setActiveStocktake} 
        currentUser={currentUser} 
        handleLogout={handleLogout} 
      />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        
        <Header 
          sseStatus={sseStatus} 
          scanStatus={scanStatus} 
          lastScannedBarcode={lastScannedBarcode} 
          soundEnabled={soundEnabled} 
          setSoundEnabled={setSoundEnabled} 
        />

        <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
          {renderTabContent()}
        </div>

      </main>

      <CommandPalette 
        isOpen={showCommandPalette} 
        onClose={() => setShowCommandPalette(false)} 
        products={products} 
        onSelectProduct={(p) => {
          setShowCommandPalette(false);
          // Add to receipt or issue cart depending on active tab
          if (activeTab === 'receipt') {
            setReceiptCart(prev => {
              const existing = prev.find(item => item.product_id === p.id);
              if (existing) return prev.map(item => item.product_id === p.id ? { ...item, quantity: item.quantity + 1 } : item);
              return [...prev, { product_id: p.id, name: p.name, barcode: p.barcode, quantity: 1, price_net: p.purchase_price_net }];
            });
          } else if (activeTab === 'issue') {
            setIssueCart(prev => {
              const existing = prev.find(item => item.product_id === p.id);
              if (existing) return prev.map(item => item.product_id === p.id ? { ...item, quantity: item.quantity + 1 } : item);
              return [...prev, { product_id: p.id, name: p.name, barcode: p.barcode, quantity: 1, stock: p.current_stock }];
            });
          } else {
            alert(`Kiválasztott termék: ${p.name} (Készleten: ${p.current_stock} db)`);
          }
        }}
      />
    </div>
  );
}
