#!/bin/bash
# Raktárkezelő Adatbázis Visszaállító Script
# Használat: ./restore.sh <mentes_fajl_utvonala>

if [ -z "$1" ]; then
  echo "Használat: $0 <mentes_fajl_utvonala>"
  exit 1
fi

BACKUP_FILE=$1

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "HIBA: A fájl nem található: ${BACKUP_FILE}"
  exit 1
fi

echo "Adatbázis visszaállítása a következő fájlból: ${BACKUP_FILE}"
echo "FIGYELEM: Ez felülírja a jelenlegi adatokat! Folytatja? (y/n)"
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
  # Drop and recreate schema inside container
  docker compose exec -T postgres psql -U inventory_user -d postgres -c "DROP DATABASE IF EXISTS inventory;"
  docker compose exec -T postgres psql -U inventory_user -d postgres -c "CREATE DATABASE inventory;"
  
  # Restore data
  docker compose exec -T postgres psql -U inventory_user -d inventory < "${BACKUP_FILE}"
  
  if [ $? -eq 0 ]; then
    echo "Sikeres visszaállítás!"
  else
    echo "HIBA: A visszaállítás sikertelen volt!"
    exit 1
  fi
else
  echo "Visszaállítás megszakítva."
fi
