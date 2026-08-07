FROM python:3.12-slim

WORKDIR /app

# System deps for Pillow and healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libjpeg62-turbo \
    zlib1g \
    && rm -rf /var/lib/apt/lists/*

# Runtime dependencies only (test deps stay out of the image)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code (see .dockerignore – tests and artifacts are excluded)
COPY . .

# Non-root user for security
RUN useradd -m -u 1000 appuser \
    && mkdir -p /app/uploads \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
