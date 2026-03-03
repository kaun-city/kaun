"""Vercel serverless entry point — wraps FastAPI via Mangum."""
import sys
from pathlib import Path

# Add parent dirs so imports work
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from mangum import Mangum
from apps.api.main import app

handler = Mangum(app, lifespan="off")
