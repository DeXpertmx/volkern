FROM python:3.11-slim

WORKDIR /app

# Instalar dependencias del sistema para psycopg2
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY auditor_core.py .
COPY .env .env

# Por defecto, el auditor corre una vez.
# En Docker Compose, usar un cron job o restart: on-failure con delay.
CMD ["python", "auditor_core.py"]
