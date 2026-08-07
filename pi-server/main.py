"""
Kids Galaxy Projector - ASGI entry point.

Deliberately thin. The application is assembled in `app.factory.create_app`,
which keeps `uvicorn main:app` working exactly as before while the logic lives
in testable layers:

    app/domain/          business rules, no framework imports
    app/application/     use cases (orchestration), depend only on ports
    app/ports.py         abstractions the use cases are written against
    app/infrastructure/  filesystem, Pillow, pub/sub, rate limiting adapters
    app/api/             FastAPI routing, error translation
"""

from app.factory import create_app

app = create_app()
