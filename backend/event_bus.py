import asyncio
import json
import redis.asyncio as aioredis
from config import settings


class EventBus:
    def __init__(self):
        self.redis_url = settings.REDIS_URL

    async def publish(self, channel: str, event_type: str, data: dict):
        redis = aioredis.from_url(self.redis_url)
        payload = {"type": event_type, "data": data}
        await redis.publish(channel, json.dumps(payload))
        await redis.close()

    async def subscribe(self, channel: str):
        redis = aioredis.from_url(self.redis_url)
        pubsub = redis.pubsub()
        await pubsub.subscribe(channel)
        try:
            # Send initial ping to open stream immediately
            yield ": ping\n\n"
            last_ping = asyncio.get_event_loop().time()

            while True:
                message = await pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=1.0
                )
                if message and message["type"] == "message":
                    data = message["data"].decode("utf-8")
                    yield f"data: {data}\n\n"

                # Send periodic keepalive ping every 15 seconds
                now = asyncio.get_event_loop().time()
                if now - last_ping > 15.0:
                    yield ": ping\n\n"
                    last_ping = now

                await asyncio.sleep(0.1)
        except asyncio.CancelledError:
            await pubsub.unsubscribe(channel)
            await redis.close()


event_bus = EventBus()
