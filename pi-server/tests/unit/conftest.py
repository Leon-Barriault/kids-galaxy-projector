"""
Unit-test conftest - no FastAPI app, no TestClient, no disk fixtures.

Isolation rules:
- Do not import main.app or TestClient here.
- Prefer unittest.mock for time, Request, and module-level state.
- Pure functions can be imported directly from main.
"""
