"""FastAPI application.

Wires up the data-serving API and the (unimplemented) recommendation seam.
No financial calculations live in this package by design.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import api, recommendation
from .config import CACHE_DIR

app = FastAPI(title="Options Pricer — Data API", version="0.1.0")

# The Vite dev server runs on a different origin during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api.router)
app.include_router(recommendation.router)


@app.get("/health")
def health() -> dict:
    """Liveness probe. Returns ok plus the resolved cache directory."""
    return {"status": "ok", "cache_dir": str(CACHE_DIR)}
