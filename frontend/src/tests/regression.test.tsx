import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';
import Valuation from '../components/Valuation/Valuation';

// Mock canvas-confetti
vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

// Mock Audio Context / playBeep

describe('Frontend Regression Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Clear localStorage
    localStorage.clear();
    // Mock window fetch
    window.fetch = vi.fn();
    // Mock window.location
    delete (window as any).location;
    window.location = { href: '' } as any;
    // Mock window EventSource as constructible class
    (window as any).EventSource = class {
      close = vi.fn();
      addEventListener = vi.fn();
      removeEventListener = vi.fn();
      onopen = vi.fn();
      onmessage = vi.fn();
      onerror = vi.fn();
    } as any;
  });

  test('Login Workflow - Renders and processes credentials', async () => {
    const mockToken = "mocked-jwt-token-12345";
    const mockUserResponse = {
      id: "u-1",
      username: "admin_test",
      role: "adminisztrátor",
      is_active: true,
      must_change_password: false
    };

    // Mock fetch for Login + fetchData (categories, locations, suppliers, products, stocktakes, movements)
    (window.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/auth/login')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ access_token: mockToken, token_type: "bearer" })
        });
      }
      if (url.includes('/auth/me')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockUserResponse)
        });
      }
      // Return empty lists for master data to allow clean loading
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([])
      });
    });

    const { container } = render(<App />);

    // Check that login screen is presented
    expect(screen.getByText('Raktárkezelő & Szerviz')).toBeInTheDocument();
    
    // Fill in credentials
    const inputs = container.querySelectorAll('input');
    const usernameInput = inputs[0];
    const passwordInput = inputs[1];
    const loginButton = screen.getByRole('button', { name: 'Bejelentkezés' });

    fireEvent.change(usernameInput, { target: { value: 'admin_test' } });
    fireEvent.change(passwordInput, { target: { value: 'securePass1!' } });
    fireEvent.click(loginButton);

    // Wait for App to transition to logged-in state (nav renders once token is set)
    await waitFor(() => {
      expect(screen.getByText('Áttekintés')).toBeInTheDocument();
    });

    // Username is rendered after /auth/me resolves — wait for it separately
    await waitFor(() => {
      expect(screen.getByText('admin_test')).toBeInTheDocument();
    });
  });

  test('Error Display - Shows Hungarian error on failed login', async () => {
    (window.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/auth/login')) {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ detail: "Hibás felhasználónév vagy jelszó" })
        });
      }
      return Promise.resolve({ ok: false });
    });

    const { container } = render(<App />);

    const inputs = container.querySelectorAll('input');
    const usernameInput = inputs[0];
    const passwordInput = inputs[1];
    const loginButton = screen.getByRole('button', { name: 'Bejelentkezés' });

    fireEvent.change(usernameInput, { target: { value: 'wrong_user' } });
    fireEvent.change(passwordInput, { target: { value: 'wrong_pass' } });
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(screen.getByText(/Hibás felhasználónév vagy jelszó/)).toBeInTheDocument();
    });
  });

  test('Valuation Report - Renders items, warnings, and calls excel export', async () => {
    const mockValuationData = {
      items: [
        {
          product_id: "p1",
          product_name: "Test Product Normal",
          sku: "SKU-NORM",
          category_name: "Cat A",
          current_stock: 10,
          purchase_price_net: 5000,
          purchase_price_gross: 6350,
          total_value_net: 50000,
          total_value_gross: 63500,
          location_name: "Loc Main",
          price_warning: false
        },
        {
          product_id: "p2",
          product_name: "Test Product Warning",
          sku: "SKU-WARN",
          category_name: "Cat B",
          current_stock: 5,
          purchase_price_net: 0,
          purchase_price_gross: 0,
          total_value_net: 0,
          total_value_gross: 0,
          location_name: "Loc Main",
          price_warning: true
        }
      ],
      total_stock: 15,
      total_value_net: 50000,
      total_value_gross: 63500
    };

    (window.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockValuationData)
    });

    const mockCategories = [{ id: "c1", name: "Cat A" }, { id: "c2", name: "Cat B" }];
    const mockLocations = [{ id: "l1", name: "Loc Main" }];

    render(
      <Valuation
        token="test-token"
        categories={mockCategories}
        locations={mockLocations}
      />
    );

    // Verify it loads and displays products
    await waitFor(() => {
      expect(screen.getByText('Test Product Normal')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Test Product Warning')).toBeInTheDocument();

    // Verify warnings and totals
    expect(screen.getByText('Figyelem! Egyes termékeknél nincs beállítva beszerzési ár. Ezek 0 Ft-tal szerepelnek a kalkulációban.')).toBeInTheDocument();
    expect(screen.getAllByText('15 db').length).toBe(2);

    // Test Excel Export click
    const excelButton = screen.getByRole('button', { name: 'Excel Letöltés' });
    fireEvent.click(excelButton);

    expect(window.location.href).toContain('/excel/export/valuation');
  });
});
