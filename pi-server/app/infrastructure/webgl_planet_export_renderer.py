"""WebGL-backed print exports.

The projector browser is the only renderer that knows the complete final planet
object graph. It uploads a hero PNG after the Three.js pipeline has finished;
this adapter persists that image for previews and uses its planet pixels on the
print sheet. New kid-tablet lithophanes use the same vector drawing manifest as
WebGL, while image-only stored planets retain the legacy raster-analysis fallback.
"""

from __future__ import annotations

import io
import math
import struct
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

from app.domain.planet import Planet
from app.infrastructure.manifest_lithophane import (
    load_manifest_for_image,
    manifest_relief_sampler,
)
from app.infrastructure.planet_export_renderer import PillowPlanetExportRenderer


class WebglPlanetExportRenderer(PillowPlanetExportRenderer):
    SNAPSHOT_SIZE = 700
    MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024
    DRAWING_GUIDE_SIZE = 620
    DRAWING_GUIDE_RADIUS_FRACTION = 0.42
    DRAWING_GUIDE_STROKE_WIDTH = 6
    DRAWING_GUIDE_COLOR = "#64B5F6"
    PRINT_BACKGROUND_THRESHOLD = 28
    PRINT_VISIBLE_THRESHOLD = 8
    PRINT_HERO_PADDING = 34
    PRINT_PDF_DPI = 150.0
    LETTER_PAGE_WIDTH = 1650
    LETTER_PAGE_HEIGHT = 1275

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

    def _visible_mask(self, image: Image.Image) -> Image.Image:
        white = Image.new("RGB", image.size, "white")
        difference = ImageChops.difference(image.convert("RGB"), white).convert("L")
        return difference.point(
            lambda value: 255 if value >= self.PRINT_VISIBLE_THRESHOLD else 0
        )

    @staticmethod
    def _mask_centroid(mask: Image.Image) -> tuple[float, float] | None:
        width, _ = mask.size
        total = 0
        x_total = 0
        y_total = 0
        for index, value in enumerate(mask.getdata()):
            if not value:
                continue
            x = index % width
            y = index // width
            total += 1
            x_total += x
            y_total += y
        if not total:
            return None
        return x_total / total, y_total / total

    def _print_hero(self, hero: Image.Image) -> Image.Image:
        """Put the isolated planet on white paper and centre it with safe margins."""
        rgba = hero.convert("RGBA")
        prepared = Image.new("RGB", rgba.size, "white")
        prepared.paste(rgba, (0, 0), rgba)

        # Snapshots created before transparent capture used the projector's dark
        # sky as an opaque background. Remove only the connected corner colour so
        # the planet's genuine dark strokes and shadows remain untouched.
        corner = prepared.getpixel((0, 0))
        if any(abs(channel - 255) > 8 for channel in corner):
            ImageDraw.floodfill(
                prepared,
                (0, 0),
                (255, 255, 255),
                thresh=self.PRINT_BACKGROUND_THRESHOLD,
            )

        # Do not trust the stored frame to already be centred. Older captures can
        # place the object toward an edge, and small decorations can make the raw
        # bounding box look centred while the much larger planet body still looks
        # shifted. Crop to visible pixels, fit the complete render safely, then
        # centre its visible-pixel centroid so the printed planet is optically as
        # well as geometrically centred.
        mask = self._visible_mask(prepared)
        bounds = mask.getbbox()
        if bounds is None:
            return Image.new("RGB", prepared.size, "white")

        visible = prepared.crop(bounds)
        max_edge = self.SNAPSHOT_SIZE - self.PRINT_HERO_PADDING * 2
        visible.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)

        visible_mask = self._visible_mask(visible)
        centroid = self._mask_centroid(visible_mask)
        centre = (self.SNAPSHOT_SIZE - 1) / 2.0
        if centroid is None:
            x = (self.SNAPSHOT_SIZE - visible.width) // 2
            y = (self.SNAPSHOT_SIZE - visible.height) // 2
        else:
            x = round(centre - centroid[0])
            y = round(centre - centroid[1])

        min_x = self.PRINT_HERO_PADDING
        min_y = self.PRINT_HERO_PADDING
        max_x = self.SNAPSHOT_SIZE - self.PRINT_HERO_PADDING - visible.width
        max_y = self.SNAPSHOT_SIZE - self.PRINT_HERO_PADDING - visible.height
        if max_x >= min_x:
            x = min(max(x, min_x), max_x)
        else:
            x = (self.SNAPSHOT_SIZE - visible.width) // 2
        if max_y >= min_y:
            y = min(max(y, min_y), max_y)
        else:
            y = (self.SNAPSHOT_SIZE - visible.height) // 2

        centred = Image.new("RGB", (self.SNAPSHOT_SIZE, self.SNAPSHOT_SIZE), "white")
        centred.paste(visible, (x, y))
        return centred

    def _drawing_with_guide(self, source: Image.Image) -> Image.Image:
        """Show the child's real drawing inside the same circle used on the tablet."""
        size = self.DRAWING_GUIDE_SIZE
        radius = round(size * self.DRAWING_GUIDE_RADIUS_FRACTION)
        centre = size // 2
        bounds = (
            centre - radius,
            centre - radius,
            centre + radius,
            centre + radius,
        )

        # The uploaded drawing is a square disc texture: pixels outside the tablet
        # guide intentionally repeat the body colour to prevent sampling seams in
        # WebGL. On paper those corner pixels are not part of the child's planet,
        # so mask them away while preserving every pixel inside the actual guide.
        artwork = source.convert("RGB").resize((size, size), Image.Resampling.LANCZOS)
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).ellipse(bounds, fill=255)

        drawing = Image.new("RGB", (size, size), "white")
        drawing.paste(artwork, (0, 0), mask)
        ImageDraw.Draw(drawing).ellipse(
            bounds,
            outline=self.DRAWING_GUIDE_COLOR,
            width=self.DRAWING_GUIDE_STROKE_WIDTH,
        )
        return drawing

    def render_print_sheet(self, planet: Planet, image_path: Path) -> bytes:
        """Compose a kid-friendly print sheet, preferring the projector WebGL frame."""
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

        hero = self._print_hero(hero)
        drawing = self._drawing_with_guide(source)
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
        canvas.paste(hero, (hero_x, hero_y))

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

    def render_print_pdf(self, planet: Planet, image_path: Path) -> bytes:
        """Return the print sheet on a standard US/Canada Letter landscape page."""
        png = self.render_print_sheet(planet, image_path)
        sheet = Image.open(io.BytesIO(png)).convert("RGB")

        # Pillow derives PDF physical size from image pixels and resolution. The
        # old 1600x1000 sheet at 150 dpi therefore became a non-standard
        # 10.67x6.67-inch page. Place that established sheet, unchanged, in the
        # middle of a 1650x1275 canvas so the PDF MediaBox is exactly 11x8.5 in
        # (Letter landscape) and common printers can print it without page-size
        # substitution or unexpected clipping.
        page = Image.new(
            "RGB",
            (self.LETTER_PAGE_WIDTH, self.LETTER_PAGE_HEIGHT),
            "white",
        )
        x = (self.LETTER_PAGE_WIDTH - sheet.width) // 2
        y = (self.LETTER_PAGE_HEIGHT - sheet.height) // 2
        page.paste(sheet, (x, y))

        output = io.BytesIO()
        page.save(output, format="PDF", resolution=self.PRINT_PDF_DPI)
        return output.getvalue()

    def export_stl(self, planet: Planet, image_path: Path, diameter_mm: float) -> bytes:
        """Generate manifest-faithful lithophane relief when vector intent exists."""
        manifest = load_manifest_for_image(image_path)
        if manifest is None:
            return super().export_stl(planet, image_path, diameter_mm)
        relief_at = manifest_relief_sampler(manifest)

        max_outer_radius = diameter_mm / 2.0
        inner_radius = max_outer_radius - self.LITHOPHANE_MAX_WALL_MM
        opening_latitude = math.radians(self.LITHOPHANE_OPENING_LATITUDE_DEGREES)

        outer_rows: list[list[tuple[float, float, float]]] = []
        inner_rows: list[list[tuple[float, float, float]]] = []
        for lat_index in range(self.LAT_SEGMENTS + 1):
            progress = lat_index / self.LAT_SEGMENTS
            latitude = opening_latitude + (math.pi / 2.0 - opening_latitude) * progress
            cos_lat = math.cos(latitude)
            sin_lat = math.sin(latitude)
            outer_row = []
            inner_row = []
            for lon_index in range(self.LON_SEGMENTS):
                longitude = -math.pi + math.tau * lon_index / self.LON_SEGMENTS
                artwork = relief_at(latitude, longitude)
                wall = self.LITHOPHANE_MIN_WALL_MM + artwork * (
                    self.LITHOPHANE_MAX_WALL_MM - self.LITHOPHANE_MIN_WALL_MM
                )
                outer_radius = inner_radius + wall
                direction = (
                    math.sin(longitude) * cos_lat,
                    sin_lat,
                    math.cos(longitude) * cos_lat,
                )
                outer_row.append(tuple(component * outer_radius for component in direction))
                inner_row.append(tuple(component * inner_radius for component in direction))
            outer_rows.append(outer_row)
            inner_rows.append(inner_row)

        triangles = self._shell_triangles(outer_rows, inner_rows)
        output = io.BytesIO()
        header = f"Kids Galaxy {planet.id} manifest spherical lithophane".encode("ascii")[:80]
        output.write(header.ljust(80, b"\0"))
        output.write(struct.pack("<I", len(triangles)))
        for a, b, c in triangles:
            normal = self._normal(a, b, c)
            output.write(struct.pack("<12fH", *normal, *a, *b, *c, 0))
        return output.getvalue()
