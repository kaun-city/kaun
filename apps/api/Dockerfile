FROM python:3.12-slim

WORKDIR /app

# Install dependencies first (layer caching)
COPY apps/api/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy source — cities config must be available at runtime
COPY apps/api/ ./apps/api/
COPY cities/ ./cities/

ENV APP_ENV=production

EXPOSE 8000

CMD ["uvicorn", "apps.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
