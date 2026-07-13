import time
import socket
import sys


def wait_for_postgres():
    host = "postgres"
    port = 5432
    print(f"Waiting for Postgres at {host}:{port}...")
    start_time = time.time()
    while True:
        try:
            with socket.create_connection((host, port), timeout=1.0):
                print("Postgres database is ready!")
                return True
        except (socket.timeout, ConnectionRefusedError):
            if time.time() - start_time > 60:
                print("Error: Postgres connection timeout (60s exceeded)")
                sys.exit(1)
            time.sleep(0.5)


if __name__ == "__main__":
    wait_for_postgres()
