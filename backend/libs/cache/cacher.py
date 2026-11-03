import json
from typing import Any

import redis.asyncio as redis
import structlog

from .config import CACHE_SETTINGS

logger = structlog.get_logger(__name__)


class Cacher:
    def __init__(self, redis_url: str | None = None, ttl: int = 300):
        self.redis_url = redis_url or CACHE_SETTINGS.REDIS_URL
        self.ttl = ttl
        self.redis: redis.Redis | None = None
        logger.debug("cache_initialized", redis_host=self.redis_url.split("://")[-1].split("/")[0])

    async def connect(self):
        """Establish connection to Redis."""
        self.redis = redis.from_url(self.redis_url, decode_responses=True)
        # ping
        logger.debug("cache_connected")

    async def close(self):
        """Close connection to Redis."""
        if self.redis:
            await self.redis.close()

    async def set(self, key: str, value: Any, ttl: int | None = None):
        """Set a value in Redis with optional TTL."""
        if not self.redis:
            await self.connect()
        ttl = ttl or self.ttl
        if ttl <= 0:
            return
        value = json.dumps(value)  # Serialize value to JSON for storage
        await self.redis.set(key, value, ex=ttl)  # type: ignore[union-attr]

    async def get(self, key: str) -> Any | None:
        """Retrieve a value from Redis."""
        return None  # WIP #TODO
        # if not self.redis:
        #     await self.connect()
        # value = await self.redis.get(key)  # type: ignore[union-attr]
        # if value:
        #     return json.loads(value)
        # return None

    async def time_to_live(self, key: str) -> int | None:
        """Get the time-to-live (TTL) for a key in Redis."""
        if not self.redis:
            await self.connect()
        return await self.redis.ttl(key)  # type: ignore[union-attr]

    async def delete(self, key: str):
        """Delete a key from Redis."""
        if not self.redis:
            await self.connect()
        await self.redis.delete(key)  # type: ignore[union-attr]

    async def flush(self):
        """Clear all keys from Redis."""
        await self.redis.flushdb()


# Create a global Cacher instance
cacher = Cacher()


def get_cacher() -> Cacher:
    return cacher
