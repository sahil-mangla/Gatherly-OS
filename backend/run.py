"""Backend server runner script."""

import os

import uvicorn

from app.config import settings

if __name__ == "__main__":
    print(f"\n✨ Starting Gatherly on http://{settings.host}:{settings.port}")
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        # WEB_CONCURRENCY sets the worker count (uvicorn ignores it while reload is on)
        workers=int(os.getenv("WEB_CONCURRENCY", "1")),
        proxy_headers=settings.trust_proxy,
        forwarded_allow_ips="*" if settings.trust_proxy else None,
    )
