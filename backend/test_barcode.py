import pytest
from unittest.mock import MagicMock
from barcode_utils import generate_next_barcode
from models import BarcodeSequence

class MockDB:
    def __init__(self):
        self.seq = None
        self.added = []
        self.flushed = False

    async def execute(self, stmt):
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = self.seq
        mock_result.scalar.return_value = None
        return mock_result

    def add(self, obj):
        self.added.append(obj)
        self.seq = obj

    async def flush(self):
        self.flushed = True

    async def begin(self):
        pass

@pytest.mark.asyncio
async def test_barcode_initial():
    db = MockDB()
    barcode = await generate_next_barcode(db)
    # Prefix matches year (e.g. 26 for 2026)
    assert barcode.startswith("26")
    # Padded sequence starts at 0001
    assert barcode == "260001"

@pytest.mark.asyncio
async def test_barcode_increment_hex():
    db = MockDB()
    # Mocking pre-existing sequence at 15 (000F)
    db.seq = BarcodeSequence(year=26, current_counter=15)
    barcode = await generate_next_barcode(db)
    assert barcode == "260010" # Hex increment: 000F -> 0010

@pytest.mark.asyncio
async def test_barcode_increment_large_hex():
    db = MockDB()
    # Mocking pre-existing sequence at 255 (00FF)
    db.seq = BarcodeSequence(year=26, current_counter=255)
    barcode = await generate_next_barcode(db)
    assert barcode == "260100" # Hex increment: 00FF -> 0100

@pytest.mark.asyncio
async def test_barcode_exhausted():
    db = MockDB()
    # Mocking pre-existing sequence at FFFF (65535)
    db.seq = BarcodeSequence(year=26, current_counter=65535)
    with pytest.raises(ValueError) as excinfo:
        await generate_next_barcode(db)
    assert "megtelt" in str(excinfo.value)
