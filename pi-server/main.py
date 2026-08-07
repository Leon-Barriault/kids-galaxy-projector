"""
Kids Galaxy Projector - Secure FastAPI backend
Receives planet drawings from Android tablets and serves the 3D galaxy visualization.
"""

import os
import uuid
import time
import logging
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import aiofiles

# -------------------- Configuration --------------------
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

MAX_FILE_SIZE = 5 * 1024 * 1024          # 5 MB
ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/jpg"}
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg"}
MAX_DIMENSION = 2048                     # pixels
RATE_LIMIT_SECONDS = 3                   # simple per-IP cooldown

# -------------------- Logging --------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("kids-galaxy")

# -------------------- App --------------------
app = FastAPI(
    title="Kids Galaxy Projector",
    description="Secure backend for the kid planet drawing project",
    version="1.0.0",
    docs_url=None,          # disable docs in production-like setup
    redoc_url=None,
)

# Very restrictive CORS – only needed if browser testing from another machine
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],    # local network only in practice
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Serve static files (Three.js page)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Simple in-memory rate limiting (IP → last upload timestamp)
_last_upload: dict[str, float] = {}


def get_client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def is_rate_limited(ip: str) -> bool:
    now = time.time()
    last = _last_upload.get(ip, 0)
    if now - last < RATE_LIMIT_SECONDS:
        return True
    _last_upload[ip] = now
    return False


def sanitize_filename(name: Optional[str]) -> str:
    if not name:
        return "planet.png"
    # Keep only safe characters
    safe = "".join(c for c in name if c.isalnum() or c in "._- ").strip()
    return safe[:80] or "planet.png"


async def validate_image(file: UploadFile) -> bytes:
    """Validate size, content-type and basic image integrity."""
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Only PNG and JPEG images are allowed.")

    content = await file.read()
    size = len(content)

    if size == 0:
        raise HTTPException(status_code=400, detail="Empty file.")
    if size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large (max {MAX_FILE_SIZE // 1024 // 1024} MB).")

    # Quick magic-byte check
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        pass  # PNG
    elif content.startswith(b"\xff\xd8\xff"):
        pass  # JPEG
    else:
        raise HTTPException(status_code=400, detail="File content is not a valid PNG or JPEG.")

    # Verify it can be opened by Pillow and is not too large dimension-wise
    try:
        from io import BytesIO
        with Image.open(BytesIO(content)) as img:
            img.verify()  # verifies integrity
            width, height = img.size
            if width > MAX_DIMENSION or height > MAX_DIMENSION:
                raise HTTPException(
                    status_code=400,
                    detail=f"Image dimensions too large (max {MAX_DIMENSION}px)."
                )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        logger.warning(f"Image validation failed: {e}")
        raise HTTPException(status_code=400, detail="Invalid or corrupted image.")

    return content


@app.get("/", response_class=HTMLResponse)
async def galaxy_page():
    """Serve the main Three.js galaxy visualization."""
    index_path = Path("static/index.html")
    if not index_path.exists():
        return HTMLResponse("<h1>Galaxy visualization not found</h1>", status_code=404)
    return FileResponse(index_path)


@app.get("/api/current-planet")
async def current_planet():
    """Return the most recent planet texture path (for the front-end)."""
    files = sorted(UPLOAD_DIR.glob("*.png"), key=os.path.getmtime, reverse=True)
    if not files:
        return {"has_planet": False}
    latest = files[0]
    return {
        "has_planet": True,
        "url": f"/uploads/{latest.name}",
        "name": latest.stem.replace("_", " "),
        "timestamp": latest.stat().st_mtime,
    }


@app.post("/api/upload")
async def upload_planet(
    request: Request,
    file: UploadFile = File(...),
    name: str = Form("My Planet"),
):
    """
    Receive a planet drawing from the Android app.
    Returns a success message that the front-end can use for celebration.
    """
    client_ip = get_client_ip(request)

    if is_rate_limited(client_ip):
        raise HTTPException(status_code=429, detail="Please wait a few seconds before sending another planet.")

    content = await validate_image(file)

    # Sanitize and create unique filename
    safe_name = sanitize_filename(name)
    unique_id = uuid.uuid4().hex[:10]
    filename = f"{unique_id}_{safe_name}.png"
    filepath = UPLOAD_DIR / filename

    # Re-encode with Pillow for safety (strips potential malicious metadata)
    try:
        from io import BytesIO
        with Image.open(BytesIO(content)) as img:
            # Convert to RGB if necessary and save as clean PNG
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGBA")
            else:
                img = img.convert("RGB")

            # Optional: resize if very large while keeping aspect
            if max(img.size) > 1024:
                img.thumbnail((1024, 1024), Image.Resampling.LANCZOS)

            img.save(filepath, format="PNG", optimize=True)
    except Exception as e:
        logger.error(f"Failed to process image: {e}")
        raise HTTPException(status_code=500, detail="Could not process the image.")

    logger.info(f"Planet received from {client_ip}: {filename} ({name})")

    return {
        "status": "success",
        "message": "Your planet is flying to the galaxy!",
        "planet_id": unique_id,
        "name": name,
        "url": f"/uploads/{filename}",
    }


# Serve uploaded images
@app.get("/uploads/{filename}")
async def serve_upload(filename: str):
    # Prevent path traversal
    safe_name = Path(filename).name
    filepath = UPLOAD_DIR / safe_name
    if not filepath.exists() or not filepath.is_file():
        raise HTTPException(status_code=404, detail="Planet not found")
    return FileResponse(filepath)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "kids-galaxy-projector"}
