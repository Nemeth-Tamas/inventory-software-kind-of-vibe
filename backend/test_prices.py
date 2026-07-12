import pytest
from decimal import Decimal, ROUND_HALF_UP
from routers.products import calculate_gross, normalize_gross

def test_calculate_gross():
    # 27% VAT
    assert calculate_gross(100, 27) == 127
    assert calculate_gross(1000, 27) == 1270
    assert calculate_gross(78, 27) == 99  # 78 * 1.27 = 99.06 -> 99
    assert calculate_gross(79, 27) == 100 # 79 * 1.27 = 100.33 -> 100
    
    # 18% VAT
    assert calculate_gross(100, 18) == 118
    
    # 5% VAT
    assert calculate_gross(100, 5) == 105
    
    # 0% VAT, AAM, TAM (which map to 0% in database)
    assert calculate_gross(100, 0) == 100
    assert calculate_gross(12345, 0) == 12345

def test_calculate_net_recalculation_logic():
    # Helper to calculate net from gross (mimics frontend/backend logic)
    def calculate_net(gross: int, vat_rate: int) -> int:
        gross_dec = Decimal(gross)
        vat_dec = Decimal(vat_rate)
        net_dec = gross_dec / (Decimal('1') + vat_dec / Decimal('100'))
        return int(net_dec.to_integral_value(rounding=ROUND_HALF_UP))
        
    # 27% VAT
    assert calculate_net(127, 27) == 100
    assert calculate_net(99, 27) == 78  # 99 / 1.27 = 77.95 -> 78
    assert calculate_net(100, 27) == 79 # 100 / 1.27 = 78.74 -> 79
    
    # 18% VAT
    assert calculate_net(118, 18) == 100
    
    # 5% VAT
    assert calculate_net(105, 5) == 100
    
    # 0% VAT / AAM / TAM
    assert calculate_net(100, 0) == 100

def test_normalize_gross():
    # Close enough values should be preserved
    assert normalize_gross(100, 127, 27) == 127
    assert normalize_gross(100, 128, 27) == 128 # Diff <= 2 preserved
    assert normalize_gross(100, 125, 27) == 125 # Diff <= 2 preserved
    
    # Far away values should be recalculated from net
    assert normalize_gross(100, 150, 27) == 127
    assert normalize_gross(100, 50, 27) == 127
