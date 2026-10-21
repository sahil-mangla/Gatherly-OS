"""Vercel serverless function entrypoint for Gatherly FastAPI backend."""

import os
import sys

# Ensure project root is available on sys.path
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from backend.app.main import app  # noqa: E402, F401
