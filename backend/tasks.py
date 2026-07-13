from celery_app import celery_app
import time
import asyncio


# Setup helper for async database sessions in Celery tasks
def run_async(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@celery_app.task(name="tasks.billingo_bulk_sync")
def billingo_bulk_sync():
    """Background job to run bulk product sync with Billingo API V3."""
    print("Celery bulk sync started...")
    # Simulate work
    time.sleep(5)
    print("Celery bulk sync completed.")
    return {"status": "success", "synced_count": 0}
