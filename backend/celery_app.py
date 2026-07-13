from celery import Celery
from config import settings

celery_app = Celery(
    "inventory_tasks", broker=settings.REDIS_URL, backend=settings.REDIS_URL
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Europe/Budapest",
    enable_utc=True,
)
