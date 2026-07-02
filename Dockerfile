# ---- Stage 1: build the React frontend ----
FROM node:22-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build            # -> /app/frontend/dist

# ---- Stage 2: Python runtime that serves API + built frontend ----
FROM python:3.11-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1
# Persist the DB on a mounted volume by default. /data is a *separate* dir from the
# baked-in seed CSVs at /app/data — mount the volume at /data (NEVER /app/data, which
# would shadow the CSVs). Overridable at runtime with -e PHARMACY_DB=...
ENV PHARMACY_DB=/data/pharmacy.db
RUN mkdir -p /data
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
COPY data/ data/
COPY --from=frontend /app/frontend/dist frontend/dist
RUN chmod +x /app/backend/entrypoint.sh
# entrypoint: seed (idempotent) → migrate (idempotent) → uvicorn
CMD ["/app/backend/entrypoint.sh"]
