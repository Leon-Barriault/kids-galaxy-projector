"""
Root conftest – intentionally minimal.

Unit tests must stay isolated from FastAPI / TestClient / disk.
App-level fixtures live in tests/integration/conftest.py only.
"""
