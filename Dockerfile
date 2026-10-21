# Build production container for Gatherly
FROM python:3.11-slim

WORKDIR /app

# Set environment defaults
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=8080 \
    ENVIRONMENT=production

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY backend/pyproject.toml .
RUN pip install --no-cache-dir \
    fastapi==0.115.0 \
    uvicorn==0.31.0 \
    pydantic==2.9.2 \
    python-dotenv==1.0.1 \
    google-genai==0.1.1 \
    sqlalchemy>=2.0.0 \
    pyjwt>=2.8.0 \
    psycopg2-binary>=2.9.9 \
    opentelemetry-api>=1.20.0 \
    opentelemetry-sdk>=1.20.0

# Copy application backend and frontend
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY package.json .

# Expose server port
EXPOSE 8080

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/api/health || exit 1

# Start Uvicorn production server
CMD ["python", "backend/run.py"]
