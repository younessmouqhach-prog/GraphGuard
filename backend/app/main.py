"""
GraphGuard — FastAPI application entry point.
============================================

FR : Point d'entrée de l'API. Au démarrage, recharge l'état persisté ; si rien
     n'est trouvé, génère un graphe et entraîne le modèle automatiquement afin
     que l'interface ait toujours des données à afficher.

EN : API entry point. On startup it reloads persisted state; if none is found it
     auto-generates a graph and trains the model so the UI always has data.

Run:  uvicorn app.main:app --reload --port 8000
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import config
from .api.routes import router
from .services.store import store


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Reload a previous trained session if present.
    # 2. Otherwise train on the real CSV dataset in dataset/ (if present).
    # 3. Otherwise fall back to the synthetic generator.
    if not store.load():
        if store.load_real():
            store.train(config.DEFAULT_TRAIN)
        else:
            store.generate(config.DEFAULT_GRAPH)
            store.train(config.DEFAULT_TRAIN)
    yield


app = FastAPI(
    title=f"{config.APP_NAME} API",
    version=config.APP_VERSION,
    description="Intelligent graph-based financial-fraud detection (GNN). "
                "Détection intelligente de fraude financière basée sur graphes.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_origin_regex=r"http://localhost:\d+",
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


# --------------------------------------------------------------------------- #
# Serve the built React frontend (single-origin production hosting).
# In local dev this folder doesn't exist, so the API behaves exactly as before.
# --------------------------------------------------------------------------- #
import os
from fastapi.responses import FileResponse

_STATIC = os.path.abspath(os.environ.get(
    "STATIC_DIR", os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")))


@app.get("/", include_in_schema=False)
def root():
    index = os.path.join(_STATIC, "index.html")
    if os.path.isfile(index):
        return FileResponse(index)
    return {"app": config.APP_NAME, "version": config.APP_VERSION,
            "docs": "/docs", "api": "/api/status"}


if os.path.isdir(_STATIC):
    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        target = os.path.join(_STATIC, full_path)
        if full_path and os.path.isfile(target):
            return FileResponse(target)
        return FileResponse(os.path.join(_STATIC, "index.html"))
