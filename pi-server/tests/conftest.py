"""
Shared fixtures for unit and integration tests.
"""

import io
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

# Ensure uploads dir exists before importing the app
os.environ.setdefault("UPLOAD_DIR", "uploads")
Path("uploads").mkdir(exist_ok=True)

from main import app, _last_upload  # noqa: E402


@pytest.fixture
def client():
    """FastAPI TestClient – used by integration tests."""
    return TestClient(app)


@pytest.fixture(autouse=True)
def clear_rate_limit():
    """Reset per-IP rate limit between tests so they stay independent."""
    _last_upload.clear()
    yield
    _last_upload.clear()


@pytest.fixture
def make_png_bytes():
    def _factory(width: int = 64, height: int = 64, color=(255, 0, 0)) -> bytes:
        img = Image.new("RGB", (width, height), color)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    return _factory


@pytest.fixture
def make_jpeg_bytes():
    def _factory(width: int = 64, height: int = 64, color=(0, 128, 255)) -> bytes:
        img = Image.new("RGB", (width, height), color)
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        return buf.getvalue()

    return _factory
