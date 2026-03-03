"""Vercel serverless entry point for Kaun API."""
from apps.api.main import app

# Vercel expects a module-level `app` ASGI application
