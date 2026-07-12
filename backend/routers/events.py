from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from event_bus import event_bus

router = APIRouter(prefix="/api/events", tags=["events"])

@router.get("")
async def sse_event_stream():
    # Return StreamingResponse with event-stream media type
    return StreamingResponse(
        event_bus.subscribe("inventory_events"),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
