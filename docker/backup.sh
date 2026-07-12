#!/bin/bash
# Raktárkezelő Adatbázis Biztonsági Mentés Script
# Használat: ./backup.sh

BACKUP_DIR="./backups"
RETENTION_DAYS=7
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/inventory_backup_${TIMESTAMP}.sql"

mkdir -p ${BACKUP_DIR}

echo "Adatbázis mentése folyamatban..."
docker compose exec -t postgres pg_dump -U inventory_user inventory > ${BACKUP_FILE}

if [ $? -eq 0 ]; then
  echo "Sikeres mentés: ${BACKUP_FILE}"
  # Töröljük a RETENTION_DAYS-nél régebbi mentéseket
  find ${BACKUP_DIR} -type f -name "inventory_backup_*.sql" -mtime +${RETENTION_DAYS} -delete
  echo "Régi mentések takarítása elvégezve (megőrzési idő: ${RETENTION_DAYS} nap)."
else
  echo "HIBA: A mentés sikertelen!"
  exit 1
fi
