# ---------- 1) build the React frontend ----------
FROM node:20-slim AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build          # -> /web/dist

# ---------- 2) python runtime (API + static) ----------
FROM python:3.11-slim AS app
WORKDIR /app

# CPU-only PyTorch (small) then the rest
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY dataset/ ./dataset/
COPY --from=web /web/dist ./frontend/dist

# Bake the trained model + state at build time so the app boots instantly
# (no training on first request). Uses the CSVs already in dataset/.
RUN cd /app/backend && python -m scripts.build_dataset

ENV STATIC_DIR=/app/frontend/dist PYTHONUNBUFFERED=1
EXPOSE 7860
WORKDIR /app/backend
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
