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
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
COPY data/ data/
COPY --from=frontend /app/frontend/dist frontend/dist
# Railway sets $PORT; bind 0.0.0.0. --app-dir puts backend/ on the import path.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8777} --app-dir backend"]
