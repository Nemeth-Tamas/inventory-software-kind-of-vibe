#!/bin/bash
set -e

# CLI Restore Helper Script for Linux

if [ -z "$1" ]; then
  echo "Error: Please supply the backup filename as the first argument."
  echo "Usage: ./restore.sh <backup_filename.dump> [--confirm]"
  exit 1
fi

BACKUP_FILE=$1
CONFIRM=$2

echo "=========================================================="
echo "WARNING: YOU ARE ABOUT TO RESTORE A DATABASE BACKUP!"
echo "Target Database: inventory"
echo "Backup File:     $BACKUP_FILE"
echo "=========================================================="

if [ "$CONFIRM" != "--confirm" ]; then
  echo "Error: Explicit confirmation is required. Please re-run with --confirm flag:"
  echo "Usage: ./restore.sh $BACKUP_FILE --confirm"
  exit 1
fi

echo "Stopping application containers (backend, worker) to prevent any writes..."
docker compose stop backend worker

echo "Running live restore inside the backup container..."
if docker compose exec -T backup python backup_manager.py restore-live "$BACKUP_FILE" --confirm; then
  echo "Restore completed successfully."
else
  echo "Error: Restore process failed!"
  echo "Starting containers back up..."
  docker compose start backend worker
  exit 1
fi

echo "Starting backend and worker containers back up..."
docker compose start backend worker

echo "Waiting for services to initialize..."
sleep 5

echo "Running health check..."
if curl -s -f http://localhost:18000/api/health > /dev/null; then
  echo "Health Check PASSED! Services are healthy and database is restored."
else
  echo "Warning: Health Check FAILED! Please inspect container logs: docker compose logs backend"
  exit 1
fi
