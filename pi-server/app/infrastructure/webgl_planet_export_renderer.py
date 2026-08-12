"""WebGL-backed print exports.

The projector browser is the only renderer that knows the complete final planet
object graph. It uploads a hero PNG after the Three.js pipeline has finished;
this adapter persists that image and uses it verbatim for preview/print/PDF.
The inherited Pillow renderer remains only as a pre-snapshot preview fallback
and as the independent spherical-lithophane geometry generator.
"""

from __future__ import annotations

import io
from pathlib import Path

from PIL import Image, ImageDraw

from app.domain.planet import Planet
from app.infrastructure.planet_export_renderer import PillowPlanetExportRenderer


class WebglPlanetExportRenderer(PillowPlanetExportRenderer):
    SNAPSHOT_SIZE = 700
    MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024

    def __init__(self, snapshot_dir: Path) -> None:
        self.snapshot_dir = snapshot_dir
        self.snapshot_dir.mkdir(parents=True, exist_ok=True)

    def _snapshot_path(self, planet: Planet) -> Path:
        return self.snapshot_dir / f"{planet.id}.png"

    def has_projector_snapshot(self, planet: Planet) -> bool:
        return self._snapshot_path(planet).is_file()

    def store_projector_snapshot(self, planet: Planet, png_bytes: bytes) -> None:
        if not png_bytes or len(png_bytes) > self.MAX_SNAPSHOT_BYTES:
            raise ValueError("Projector snapshot is empty or too large")
        if not png_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ValueError("Projector snapshot is not a PNG")

        try:
            with Image.open(io.BytesIO(png_bytes)) as image:
                image.verify()
            with Image.open(io.BytesIO(png_bytes)) as image:
                if image.size != (self.SNAPSHOT_SIZE, self.SNAPSHOT_SIZE):
                    raise ValueError(
                        f"Projector snapshot must be {self.SNAPSHOT_SIZE}x{self.SNAPSHOT_SIZE}"
                    )
        except (OSError, SyntaxError) as error:
            raise ValueError("Projector snapshot PNG is invalid") from error

        target = self._snapshot_path(planet)
        temporary = target.with_suffix(".tmp")
        temporary.write_bytes(png_bytes)
        temporary.replace(target)

    def _projector_snapshot(self, planet: Planet) -> Image.Image | None:
        path = self._snapshot_path(planet)
        if not path.is_file():
            return None
        try:
            with Image.open(path) as image:
                return image.convert("RGBA")
        except OSError:
            path.unlink(missing_ok=True)
            return None

    def render_preview(self, planet: Planet, image_path: Path) -> bytes:
        snapshot = self._snapshot_path(planet)
        if snapshot.is_file():
            return snapshot.read_bytes()
        return super().render_preview(planet, image_path)

    def render_print_sheet(self, planet: Planet, image_path: Path) -> bytes:
        """
        Compose the print sheet, preferring the projector's own WebGL frame.

        This used to raise when no snapshot existed, which the API turned into a
        permanent 409. That made printing depend on the projector browser having
        loaded *this* planet since it last started, and there are ordinary ways
        for that never to happen: nobody has the projector page open; the
        projector holds twelve planets while the manager lists thirty, so
        everything past the twelfth can never be snapshotted; or the manager
        prints in the second between upload and the projector's capture.

        A parent printing their child's planet should never be told "409". So
        the server-side render - already trusted enough to be the preview
        fallback - is the fallback here too, and the sheet says which one the
        reader is holding rather than quietly passing off an approximation as
        the real render.
        """
        source = Image.open(image_path).convert("RGB")
        hero = self._projector_snapshot(planet)
        if hero is not None:
            heading = "Projector WebGL render"
            provenance = "projector WebGL"
            footer = "Kids Galaxy Projector · captured from the live Three.js planet renderer"
        else:
            hero = self._render_projector_mapped_sphere(source, planet)
            heading = "Planet preview"
            provenance = "server render"
            footer = "Kids Galaxy Projector · rendered by the galaxy server"

        drawing = source.copy()
        drawing.thumbnail((620, 620), Image.Resampling.LANCZOS)
        hero.thumbnail((700, 700), Image.Resampling.LANCZOS)

        canvas = Image.new("RGB", (self.PRINT_WIDTH, self.PRINT_HEIGHT), "white")
        draw = ImageDraw.Draw(canvas)
        font = self._font(32)
        label_font = self._font(22)
        draw.text((70, 45), planet.display_name, fill="#111827", font=font)
        draw.text((70, 92), heading, fill="#4b5563", font=label_font)
        draw.text((895, 92), "Kid drawing", fill="#4b5563", font=label_font)

        hero_x = 60 + (700 - hero.width) // 2
        hero_y = 145 + (700 - hero.height) // 2
        canvas.paste(hero, (hero_x, hero_y), hero)

        x = 895 + (620 - drawing.width) // 2
        y = 145 + (620 - drawing.height) // 2
        canvas.paste(drawing, (x, y))
        draw.rounded_rectangle((875, 130, 1535, 790), radius=24, outline="#d1d5db", width=3)
        draw.text(
            (70, 870),
            (
                f"Style: {planet.style}   Planet ID: {planet.id}   "
                f"Visual source: {provenance}"
            ),
            fill="#6b7280",
            font=label_font,
        )
        draw.text((70, 915), footer, fill="#9ca3af", font=label_font)

        output = io.BytesIO()
        canvas.save(output, format="PNG", compress_level=4)
        return output.getvalue()
