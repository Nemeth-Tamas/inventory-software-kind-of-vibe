#!/bin/sh
# Entrypoint for running migrations and starting FastAPI application

echo "Waiting for postgres..."
python wait_for_db.py

# Run alembic migrations
echo "Running database migrations..."
alembic upgrade head

# Run db initialization (first admin creation)
echo "Running database initialization..."
python init_db.py

# Start uvicorn
echo "Starting FastAPI server..."
exec uvicorn main:app --host 0.0.0.0 --port 18000
