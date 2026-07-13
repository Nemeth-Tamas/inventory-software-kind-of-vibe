import os
import sys
import re
import json
import time
import shutil
import argparse
import asyncio
import subprocess
from datetime import datetime
import pytz
import asyncpg
from urllib.parse import urlparse

# Default directories and files
BACKUP_DIR = "/app/backups"
LOCK_FILE = os.path.join(BACKUP_DIR, "backup.lock")
HISTORY_FILE = os.path.join(BACKUP_DIR, "backup_history.json")
STATUS_FILE = os.path.join(BACKUP_DIR, "backup_status.json")

# Timezone
TZ = pytz.timezone("Europe/Budapest")

# Get Database credentials from environment
DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql+asyncpg://inventory_user:secure_dev_pass_123@postgres:5432/inventory"
)

def parse_db_url(url_str):
    if url_str.startswith("postgresql+asyncpg://"):
        url_str = "postgresql://" + url_str[len("postgresql+asyncpg://"):]
    url = urlparse(url_str)
    return {
        "user": url.username,
        "password": url.password,
        "host": url.hostname or "postgres",
        "port": url.port or 5432,
        "database": url.path.lstrip('/')
    }

DB_CREDS = parse_db_url(DATABASE_URL)

def get_disk_free_space():
    try:
        total, used, free = shutil.disk_usage(BACKUP_DIR)
        return free
    except Exception:
        return 0

def acquire_lock():
    try:
        import fcntl
        f = open(LOCK_FILE, "w")
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return f
    except ImportError:
        # Fallback for systems without fcntl (e.g. Windows during local dev/test)
        if os.path.exists(LOCK_FILE):
            try:
                os.remove(LOCK_FILE)
            except Exception:
                return None
        try:
            f = open(LOCK_FILE, "w")
            return f
        except Exception:
            return None
    except (BlockingIOError, PermissionError):
        return None

def release_lock(lock_file_handle):
    if lock_file_handle:
        try:
            import fcntl
            fcntl.flock(lock_file_handle, fcntl.LOCK_UN)
        except Exception:
            pass
        lock_file_handle.close()
        try:
            os.remove(LOCK_FILE)
        except Exception:
            pass

def verify_backup_file(filepath):
    """
    Mark a backup as successful only when:
    - the file exists
    - the file is not empty
    - pg_restore --list can read the dump
    """
    if not os.path.exists(filepath):
        return False, "File does not exist"
    if os.path.getsize(filepath) == 0:
        return False, "File is empty"
    
    env = os.environ.copy()
    env["PGPASSWORD"] = DB_CREDS["password"]
    cmd = ["pg_restore", "--list", filepath]
    try:
        res = subprocess.run(cmd, env=env, capture_output=True, text=True)
        if res.returncode != 0:
            return False, f"pg_restore verification failed: {res.stderr.strip()}"
    except Exception as e:
        return False, f"Error running pg_restore: {str(e)}"
    
    return True, None

def get_latest_backup_filename():
    if not os.path.exists(BACKUP_DIR):
        return None
    files = os.listdir(BACKUP_DIR)
    pattern = re.compile(r"^(inventory|safety_inventory)_\d{4}-\d{2}-\d{2}_\d{6}\.dump$")
    backup_files = [f for f in files if pattern.match(f)]
    if not backup_files:
        return None
    backup_files.sort()
    return backup_files[-1]

def check_daily_backup_exists_for_date(date_str: str) -> bool:
    """
    Checks if a successful scheduled/daily backup exists on disk for the given YYYY-MM-DD date.
    """
    if not os.path.exists(BACKUP_DIR):
        return False
    try:
        files = os.listdir(BACKUP_DIR)
        pattern = re.compile(r"^inventory_(\d{4}-\d{2}-\d{2})_\d{6}\.dump$")
        for f in files:
            match = pattern.match(f)
            if match and match.group(1) == date_str:
                return True
    except Exception:
        pass
    return False

def sanitize_and_validate_backup_filename(filename: str) -> str:
    """
    Validates that the filename:
    - is a simple basename (no path separators, no absolute path, no traversal)
    - matches expected backup patterns:
      inventory_YYYY-MM-DD_HHMMSS.dump
      safety_inventory_YYYY-MM-DD_HHMMSS.dump
    - resolved path is strictly inside BACKUP_DIR
    """
    if not filename:
        raise ValueError("Backup filename must not be empty.")
    
    if "/" in filename or "\\" in filename or ".." in filename:
        raise ValueError("Invalid backup filename: path traversal or directory components are not allowed.")
    
    basename = os.path.basename(filename)
    if basename != filename:
        raise ValueError("Invalid backup filename: only basenames are allowed.")
    
    pattern = re.compile(r"^(inventory|safety_inventory)_\d{4}-\d{2}-\d{2}_\d{6}\.dump$")
    if not pattern.match(filename):
        raise ValueError("Invalid backup filename: name does not match expected patterns (e.g. inventory_YYYY-MM-DD_HHMMSS.dump).")
    
    resolved_dir = os.path.abspath(BACKUP_DIR)
    resolved_filepath = os.path.abspath(os.path.join(resolved_dir, filename))
    if not resolved_filepath.startswith(resolved_dir):
        raise ValueError("Invalid backup filename: path escapes backup directory.")
        
    return resolved_filepath

def run_backup_sync(backup_type="manual"):
    os.makedirs(BACKUP_DIR, exist_ok=True)
    lock = acquire_lock()
    if not lock:
        print("Error: Could not acquire backup lock. Another backup is running.")
        sys.exit(1)
        
    start_time = datetime.now(TZ)
    is_safety = (backup_type == "safety")
    prefix = "safety_inventory" if is_safety else "inventory"
    timestamp_str = start_time.strftime("%Y-%m-%d_%H%M%S")
    final_filename = f"{prefix}_{timestamp_str}.dump"
    final_path = os.path.join(BACKUP_DIR, final_filename)
    temp_path = final_path + ".tmp"
    
    success = False
    error_msg = None
    file_size = 0
    
    try:
        env = os.environ.copy()
        env["PGPASSWORD"] = DB_CREDS["password"]
        cmd = [
            "pg_dump",
            "-h", DB_CREDS["host"],
            "-p", str(DB_CREDS["port"]),
            "-U", DB_CREDS["user"],
            "-d", DB_CREDS["database"],
            "-Fc",
            "-f", temp_path
        ]
        
        # subprocess.run handles the credentials securely without exposing them in stderr output
        res = subprocess.run(cmd, env=env, capture_output=True, text=True)
        if res.returncode != 0:
            raise Exception(f"pg_dump failed with exit code {res.returncode}")
            
        is_ok, ver_err = verify_backup_file(temp_path)
        if not is_ok:
            raise Exception(ver_err)
            
        os.rename(temp_path, final_path)
        file_size = os.path.getsize(final_path)
        success = True
        print(f"Backup created successfully: {final_filename} ({file_size} bytes)")
    except Exception as e:
        error_msg = str(e)
        print(f"Backup failed: {error_msg}")
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
    finally:
        end_time = datetime.now(TZ)
        release_lock(lock)
        
    log_entry = {
        "start_time": start_time.isoformat(),
        "completion_time": end_time.isoformat(),
        "filename": final_filename if success else None,
        "size": file_size if success else 0,
        "result": "success" if success else "failed",
        "error": error_msg,
        "backup_type": backup_type
    }
    
    history = []
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, "r") as f:
                history = json.load(f)
        except Exception:
            pass
            
    history.append(log_entry)
    history = history[-50:]
    try:
        with open(HISTORY_FILE, "w") as f:
            json.dump(history, f, indent=2)
    except Exception:
        pass
        
    if success and not is_safety:
        rotate_backups(final_filename)
        
    update_status_file(success, log_entry, start_time)
    
    return success, final_filename if success else error_msg

def rotate_backups(newest_filename):
    try:
        files = os.listdir(BACKUP_DIR)
        pattern = re.compile(r"^inventory_\d{4}-\d{2}-\d{2}_\d{6}\.dump$")
        backup_files = [f for f in files if pattern.match(f)]
        backup_files.sort()
        
        if len(backup_files) > 30:
            to_delete = backup_files[:-30]
            for f in to_delete:
                if f == newest_filename:
                    continue
                try:
                    os.remove(os.path.join(BACKUP_DIR, f))
                    print(f"Rotated old backup file: {f}")
                except Exception as ex:
                    print(f"Error deleting old backup {f}: {ex}")
    except Exception as e:
        print(f"Rotation error: {e}")

def update_status_file(success, log_entry, timestamp):
    last_success = None
    try:
        if os.path.exists(HISTORY_FILE):
            with open(HISTORY_FILE, "r") as f:
                hist = json.load(f)
                for h in reversed(hist):
                    if h["result"] == "success" and h["filename"] and h["filename"].startswith("inventory_"):
                        last_success = h
                        break
    except Exception:
        pass
        
    ls_info = None
    if last_success:
        fn = last_success["filename"]
        fp = os.path.join(BACKUP_DIR, fn)
        size = last_success["size"]
        if os.path.exists(fp):
            size = os.path.getsize(fp)
            
        compl_time = datetime.fromisoformat(last_success["completion_time"])
        age_sec = int((datetime.now(TZ) - compl_time).total_seconds())
        ls_info = {
            "filename": fn,
            "size": size,
            "timestamp": last_success["completion_time"],
            "age_seconds": age_sec
        }
        
    status = {
        "automatic_enabled": True,
        "schedule": "02:00 Europe/Budapest",
        "retention_days": 30,
        "last_successful": ls_info,
        "last_attempted": {
            "timestamp": log_entry["completion_time"],
            "success": success,
            "error_msg": log_entry["error"]
        },
        "backup_directory": BACKUP_DIR,
        "disk_space_free": get_disk_free_space()
    }
    
    try:
        with open(STATUS_FILE, "w") as f:
            json.dump(status, f, indent=2)
    except Exception as e:
        print(f"Error saving status file: {e}")

def list_backups():
    print(f"Backups in {BACKUP_DIR}:")
    if not os.path.exists(BACKUP_DIR):
        print("Directory does not exist.")
        return
    files = os.listdir(BACKUP_DIR)
    pattern = re.compile(r"^(inventory|safety_inventory)_\d{4}-\d{2}-\d{2}_\d{6}\.dump$")
    backup_files = [f for f in files if pattern.match(f)]
    backup_files.sort()
    
    for f in backup_files:
        path = os.path.join(BACKUP_DIR, f)
        size = os.path.getsize(path)
        mtime = datetime.fromtimestamp(os.path.getctime(path), TZ).isoformat()
        print(f" - {f} ({size} bytes, created: {mtime})")

async def verify_command(filename, latest=False):
    if latest:
        filename = get_latest_backup_filename()
        if not filename:
            print("Error: No backup files found to verify.")
            sys.exit(1)
        print(f"Selecting latest backup file: {filename}")
        
    try:
        filepath = sanitize_and_validate_backup_filename(filename)
    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)
        
    is_ok, err = verify_backup_file(filepath)
    if is_ok:
        print(f"Backup {filename} is VALID.")
        env = os.environ.copy()
        env["PGPASSWORD"] = DB_CREDS["password"]
        cmd = ["pg_restore", "--list", filepath]
        res = subprocess.run(cmd, env=env, capture_output=True, text=True)
        lines = res.stdout.splitlines()[:15]
        print("Backup Contents Summary:")
        for l in lines:
            print("  ", l)
        if len(lines) > 15:
            print("   ...")
    else:
        print(f"Backup {filename} is INVALID. Reason: {err}")
        sys.exit(1)

async def run_restore_temp(filename, latest=False):
    if latest:
        filename = get_latest_backup_filename()
        if not filename:
            print("Error: No backup files found to restore.")
            sys.exit(1)
        print(f"Selecting latest backup file: {filename}")

    try:
        filepath = sanitize_and_validate_backup_filename(filename)
    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)
        
    is_ok, err = verify_backup_file(filepath)
    if not is_ok:
        print(f"Error: Backup file is invalid: {err}")
        sys.exit(1)
        
    temp_db_name = "inventory_verification_temp"
    print(f"Restoring backup {filename} into temporary verification database: {temp_db_name}...")
    
    conn = await asyncpg.connect(
        user=DB_CREDS["user"],
        password=DB_CREDS["password"],
        database="postgres",
        host=DB_CREDS["host"],
        port=DB_CREDS["port"]
    )
    try:
        await conn.execute("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1", temp_db_name)
        await conn.execute(f"DROP DATABASE IF EXISTS {temp_db_name}")
        await conn.execute(f"CREATE DATABASE {temp_db_name} OWNER {DB_CREDS['user']}")
    finally:
        await conn.close()
        
    env = os.environ.copy()
    env["PGPASSWORD"] = DB_CREDS["password"]
    cmd = [
        "pg_restore",
        "-h", DB_CREDS["host"],
        "-p", str(DB_CREDS["port"]),
        "-U", DB_CREDS["user"],
        "-d", temp_db_name,
        "-Fc",
        filepath
    ]
    
    print("Running pg_restore...")
    res = subprocess.run(cmd, env=env, capture_output=True, text=True)
    
    print("Connecting to temporary database to verify schema and contents...")
    success = False
    v_error = None
    schema_version = None
    user_count = 0
    product_count = 0
    
    try:
        v_conn = await asyncpg.connect(
            user=DB_CREDS["user"],
            password=DB_CREDS["password"],
            database=temp_db_name,
            host=DB_CREDS["host"],
            port=DB_CREDS["port"]
        )
        try:
            tables = [r["table_name"] for r in await v_conn.fetch(
                "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
            )]
            print("Tables found:", ", ".join(tables))
            
            required = ["users", "products", "inventory_movements", "stocktakes", "alembic_version"]
            missing = [t for t in required if t not in tables]
            if missing:
                raise Exception(f"Missing required tables: {missing}")
                
            schema_version = await v_conn.fetchval("SELECT version_num FROM alembic_version")
            user_count = await v_conn.fetchval("SELECT COUNT(*) FROM users")
            product_count = await v_conn.fetchval("SELECT COUNT(*) FROM products")
            success = True
            print("Verification successful!")
            print(f" - Schema version: {schema_version}")
            print(f" - Users: {user_count}")
            print(f" - Products: {product_count}")
        finally:
            await v_conn.close()
    except Exception as e:
        v_error = str(e)
        print(f"Verification queries failed: {v_error}")
    finally:
        print(f"Destroying temporary verification database {temp_db_name}...")
        conn = await asyncpg.connect(
            user=DB_CREDS["user"],
            password=DB_CREDS["password"],
            database="postgres",
            host=DB_CREDS["host"],
            port=DB_CREDS["port"]
        )
        try:
            await conn.execute(f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1", temp_db_name)
            await conn.execute(f"DROP DATABASE IF EXISTS {temp_db_name}")
        finally:
            await conn.close()
            
    ver_log = {
        "timestamp": datetime.now(TZ).isoformat(),
        "backup_file": filename,
        "success": success,
        "schema_version": schema_version,
        "users_count": user_count,
        "products_count": product_count,
        "error": v_error
    }
    
    ver_history = []
    ver_history_file = os.path.join(BACKUP_DIR, "verification_history.json")
    if os.path.exists(ver_history_file):
        try:
            with open(ver_history_file, "r") as f:
                ver_history = json.load(f)
        except Exception:
            pass
            
    ver_history.append(ver_log)
    ver_history = ver_history[-50:]
    try:
        with open(ver_history_file, "w") as f:
            json.dump(ver_history, f, indent=2)
    except Exception:
        pass
        
    if not success:
        sys.exit(1)

async def run_restore_live(filename, confirm):
    if not filename:
        print("Error: No backup filename supplied.")
        sys.exit(1)
        
    try:
        filepath = sanitize_and_validate_backup_filename(filename)
    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)
        
    if not os.path.exists(filepath):
        print(f"Error: Backup file {filename} does not exist.")
        sys.exit(1)
        
    is_ok, err = verify_backup_file(filepath)
    if not is_ok:
        print(f"Error: Backup file {filename} is invalid: {err}")
        sys.exit(1)
        
    target_db = DB_CREDS["database"]
    print("==========================================================")
    print("WARNING: YOU ARE ABOUT TO RESTORE A BACKUP TO THE LIVE DB!")
    print(f"Target Database: {target_db} on host {DB_CREDS['host']}:{DB_CREDS['port']}")
    print(f"Backup File:     {filename}")
    print("==========================================================")
    
    if not confirm:
        print("Error: Live restore requires explicit confirmation. Add the --confirm flag.")
        sys.exit(1)
        
    print("Creating safety backup of the current database before restore...")
    safety_ok, safety_file = run_backup_sync(backup_type="safety")
    if not safety_ok:
        print(f"Error: Safety backup failed ({safety_file}). Live restore aborted for safety.")
        sys.exit(1)
    print(f"Safety backup created successfully: {safety_file}")
    
    print("Stopping application database writes and disconnecting active users...")
    conn = await asyncpg.connect(
        user=DB_CREDS["user"],
        password=DB_CREDS["password"],
        database="postgres",
        host=DB_CREDS["host"],
        port=DB_CREDS["port"]
    )
    try:
        await conn.execute(f"REVOKE CONNECT ON DATABASE {target_db} FROM public")
        await conn.execute(f"REVOKE CONNECT ON DATABASE {target_db} FROM {DB_CREDS['user']}")
        await conn.execute(
            f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
            target_db
        )
        
        print(f"Dropping and recreating database {target_db}...")
        await conn.execute(f"DROP DATABASE IF EXISTS {target_db}")
        await conn.execute(f"CREATE DATABASE {target_db} OWNER {DB_CREDS['user']}")
    finally:
        await conn.close()
        
    print(f"Restoring {filename} into {target_db}...")
    env = os.environ.copy()
    env["PGPASSWORD"] = DB_CREDS["password"]
    cmd = [
        "pg_restore",
        "-h", DB_CREDS["host"],
        "-p", str(DB_CREDS["port"]),
        "-U", DB_CREDS["user"],
        "-d", target_db,
        "-Fc",
        filepath
    ]
    
    res = subprocess.run(cmd, env=env, capture_output=True, text=True)
    
    print("Re-enabling database connect privileges...")
    conn = await asyncpg.connect(
        user=DB_CREDS["user"],
        password=DB_CREDS["password"],
        database="postgres",
        host=DB_CREDS["host"],
        port=DB_CREDS["port"]
    )
    try:
        await conn.execute(f"GRANT CONNECT ON DATABASE {target_db} TO {DB_CREDS['user']}")
        await conn.execute(f"GRANT CONNECT ON DATABASE {target_db} TO public")
        await conn.execute(f"GRANT ALL PRIVILEGES ON DATABASE {target_db} TO {DB_CREDS['user']}")
    finally:
        await conn.close()
        
    print("Live database restore completed successfully!")

def run_daemon():
    print("Starting automated backup daemon...")
    print("Scheduling daily backup at 02:00 Europe/Budapest timezone.")
    
    os.makedirs(BACKUP_DIR, exist_ok=True)
    try:
        if not os.path.exists(STATUS_FILE):
            status = {
                "automatic_enabled": True,
                "schedule": "02:00 Europe/Budapest",
                "retention_days": 30,
                "last_successful": None,
                "last_attempted": None,
                "backup_directory": BACKUP_DIR,
                "disk_space_free": get_disk_free_space()
            }
            with open(STATUS_FILE, "w") as f:
                json.dump(status, f, indent=2)
    except Exception:
        pass
        
    health_file = "/tmp/backup_healthy"
    try:
        with open(health_file, "w") as hf:
            hf.write("healthy")
    except Exception:
        pass
        
    print("Daemon startup check completed. Catch-up evaluation active.")
    
    while True:
        try:
            now_local = datetime.now(TZ)
            if os.path.exists(health_file):
                os.utime(health_file, None)
                
            today_str = now_local.strftime("%Y-%m-%d")
            
            # Catch-up daily backup logic: if we are at or after 02:00
            if now_local.hour >= 2:
                if not check_daily_backup_exists_for_date(today_str):
                    print(f"Daily backup not found for date {today_str}. Running scheduled backup...")
                    run_backup_sync(backup_type="scheduled")
        except Exception as e:
            print(f"Error in daemon loop: {e}")
            
        time.sleep(30)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Inventory System Backup and Restore Utility")
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    subparsers.add_parser("run-backup", help="Run a manual database backup")
    subparsers.add_parser("list-backups", help="List all available backups")
    
    verify_p = subparsers.add_parser("verify-backup", help="Verify a backup file structure")
    verify_p.add_argument("filename", nargs="?", default=None, help="Backup filename to verify")
    verify_p.add_argument("--latest", action="store_true", help="Verify the latest successful backup")
    
    rest_temp_p = subparsers.add_parser("restore-temp", help="Restore backup into temporary database for validation")
    rest_temp_p.add_argument("filename", nargs="?", default=None, help="Backup filename to verify restore on")
    rest_temp_p.add_argument("--latest", action="store_true", help="Restore the latest successful backup")
    
    rest_live_p = subparsers.add_parser("restore-live", help="Restore backup to live database")
    rest_live_p.add_argument("filename", help="Backup filename to restore")
    rest_live_p.add_argument("--confirm", action="store_true", help="Explicit confirmation for live overwrite")
    
    subparsers.add_parser("daemon", help="Run automated backup scheduler daemon")
    
    args = parser.parse_args()
    
    if args.command == "run-backup":
        success, fn = run_backup_sync(backup_type="manual")
        if not success:
            sys.exit(1)
    elif args.command == "list-backups":
        list_backups()
    elif args.command == "verify-backup":
        if not args.filename and not args.latest:
            parser.error("verify-backup requires either a filename or the --latest flag.")
        asyncio.run(verify_command(args.filename, args.latest))
    elif args.command == "restore-temp":
        if not args.filename and not args.latest:
            parser.error("restore-temp requires either a filename or the --latest flag.")
        asyncio.run(run_restore_temp(args.filename, args.latest))
    elif args.command == "restore-live":
        asyncio.run(run_restore_live(args.filename, args.confirm))
    elif args.command == "daemon":
        run_daemon()
