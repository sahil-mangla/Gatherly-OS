# syntax=docker/dockerfile:1
# Production container for Gatherly (multi-stage, non-root).

FROM python:3.11.13-slim-bookworm AS builder
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /build
COPY requirements.txt .
RUN pip install --prefix=/install -r requirements.txt

FROM python:3.11.13-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=8080 \
    ENVIRONMENT=production \
    WEB_CONCURRENCY=2 \
    DATABASE_URL=sqlite:////app/data/gatherly.db

COPY --from=builder /install /usr/local

# Unprivileged runtime user; /app/data is the only writable location (SQLite default).
RUN groupadd --system --gid 10001 gatherly \
    && useradd --system --uid 10001 --gid gatherly --no-create-home gatherly \
    && mkdir -p /app/data \
    && chown gatherly:gatherly /app/data
WORKDIR /app

COPY --chown=gatherly:gatherly backend/ ./backend/
COPY --chown=gatherly:gatherly frontend/ ./frontend/

USER gatherly
EXPOSE 8080

# Stdlib-only healthcheck (no curl/apt needed in the image)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import os,sys,urllib.request as u; sys.exit(0 if u.urlopen('http://127.0.0.1:%s/api/health' % os.environ.get('PORT', '8080'), timeout=3).status == 200 else 1)"]

# JWT_SECRET (>= 32 random bytes) is REQUIRED when ENVIRONMENT=production: the app refuses to start.
CMD ["python", "backend/run.py"]
