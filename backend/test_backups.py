import pytest
import re
import os
from unittest.mock import patch

# Import backup_manager components
from backup_manager import rotate_backups, verify_backup_file

def test_backup_filename_pattern():
    pattern = re.compile(r"^inventory_\d{4}-\d{2}-\d{2}_\d{6}\.dump$")
    assert pattern.match("inventory_2026-07-13_020000.dump") is not None
    assert pattern.match("safety_inventory_2026-07-13_020000.dump") is None
    assert pattern.match("inventory_2026-07-13_020000.dump.tmp") is None
    assert pattern.match("inventory_2026-07-13.dump") is None

def test_rotate_backups_retention():
    # Mock listdir to return 35 backup files
    mock_files = [f"inventory_2026-07-{i:02d}_020000.dump" for i in range(1, 36)]
    
    with patch("os.listdir", return_value=mock_files), \
         patch("os.remove") as mock_remove:
        # newest is day 35
        newest = "inventory_2026-07-35_020000.dump"
        rotate_backups(newest)
        
        # Should delete the oldest 5 files (day 1 to 5)
        assert mock_remove.call_count == 5
        deleted_files = [call.args[0] for call in mock_remove.mock_calls]
        for f in mock_files[:5]:
            assert any(f in path for path in deleted_files)
        # Should not delete the newest file
        for f in deleted_files:
            assert newest not in f

@pytest.mark.anyio
async def test_unsafe_restore_protection():
    from backup_manager import run_restore_live
    
    # 1. No filename
    with pytest.raises(SystemExit):
        await run_restore_live("", confirm=False)
        
    # 2. Non-existent file
    with pytest.raises(SystemExit):
        await run_restore_live("inventory_1990-01-01_120000.dump", confirm=True)
        
    # 3. No confirm flag
    with patch("os.path.exists", return_value=True), \
         patch("backup_manager.verify_backup_file", return_value=(True, None)):
        with pytest.raises(SystemExit):
            await run_restore_live("inventory_2026-07-13_084454.dump", confirm=False)

def test_sanitize_and_validate_backup_filename():
    from backup_manager import sanitize_and_validate_backup_filename
    
    # Valid filenames
    assert sanitize_and_validate_backup_filename("inventory_2026-07-13_020000.dump").endswith("inventory_2026-07-13_020000.dump")
    assert sanitize_and_validate_backup_filename("safety_inventory_2026-07-13_120000.dump").endswith("safety_inventory_2026-07-13_120000.dump")

    # Invalid extensions
    with pytest.raises(ValueError):
        sanitize_and_validate_backup_filename("inventory_2026-07-13_020000.txt")
        
    # Invalid patterns
    with pytest.raises(ValueError):
        sanitize_and_validate_backup_filename("random_file.dump")

    # Path traversal attempts
    with pytest.raises(ValueError):
        sanitize_and_validate_backup_filename("../escape.dump")
    with pytest.raises(ValueError):
        sanitize_and_validate_backup_filename("subdir/inventory_2026-07-13_020000.dump")
    with pytest.raises(ValueError):
        sanitize_and_validate_backup_filename("/absolute/path/inventory_2026-07-13_020000.dump")
    with pytest.raises(ValueError):
        sanitize_and_validate_backup_filename("C:\\inventory_2026-07-13_020000.dump")


def test_catch_up_logic():
    from backup_manager import check_daily_backup_exists_for_date
    
    mock_files = [
        "inventory_2026-07-10_020000.dump",
        "safety_inventory_2026-07-11_120000.dump",
    ]
    
    with patch("os.listdir", return_value=mock_files), \
         patch("os.path.exists", return_value=True):
         
        assert check_daily_backup_exists_for_date("2026-07-10") is True
        assert check_daily_backup_exists_for_date("2026-07-11") is False
        assert check_daily_backup_exists_for_date("2026-07-12") is False

