"""
Kaun API — FastAPI application entry point.

Start locally:
    uvicorn apps.api.main:app --reload

Or via Docker:
    docker compose up
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text  # noqa: F401 — used in lifespan

from .config import get_settings
from .database import engine
from .models import Base
from .routers import buzz, community, pin, ward_profile, wards
from .schemas import HealthResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create tables on startup (idempotent). Dispose engine on shutdown."""
    logger.info("Kaun API starting (env=%s)", settings.app_env)
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        await conn.run_sync(lambda c: Base.metadata.create_all(c, checkfirst=True))
    yield
    await engine.dispose()
    logger.info("Kaun API shut down")


app = FastAPI(
    title="Kaun API",
    description="Civic accountability data for Indian cities. Pin a place — know who's responsible.",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(pin.router)
app.include_router(wards.router)
app.include_router(buzz.router)
app.include_router(ward_profile.router)
app.include_router(community.router)


@app.get("/health", response_model=HealthResponse, tags=["meta"])
async def health() -> HealthResponse:
    """
    Health check — always returns 200.
    `db: true` means the database is reachable; `db: false` means degraded mode.
    """
    db_ok = False
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
            db_ok = True
    except Exception:
        pass

    return HealthResponse(ok=True, db=db_ok)
