"""Authoritative Pi-side print and spherical-lithophane exports.

The projector owns the visual contract for kid artwork: authored strokes are
wrapped 480 degrees longitudinally and mapped to +/-65 degrees latitude over an
explicit body colour. The manager never re-renders a planet; it only downloads
exports produced here.
"""

from __future__ import annotations

import io
import math
import struct
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from app.domain.planet import Planet
from app.ports import PlanetExportRenderer


class PillowPlanetExportRenderer(PlanetExportRenderer):
    PRINT_WIDTH = 1600
    PRINT_HEIGHT = 1000
    PREVIEW_SIZE = 700

    STROKE_WRAP_DEGREES = 480.0
    STROKE_LATITUDE_DEGREES = 130.0
    HALF_WRAP_RADIANS = math.radians(STROKE_WRAP_DEGREES / 2.0)
    HALF_LATITUDE_RADIANS = math.radians(STROKE_LATITUDE_DEGREES / 2.0)

    STANDARD_SPHERE_RADIUS_RATIO = 0.44
    RINGED_SPHERE_RADIUS_RATIO = 0.34
    RING_MAJOR_RADIUS_FACTOR = 1.34
    RING_MINOR_RADIUS_FACTOR = 0.52
    RING_ROLL_DEGREES = -14.0
    RING_STROKE_WIDTH = 20

    ARTWORK_DISTANCE_START = 20.0
    ARTWORK_DISTANCE_FULL = 92.0
    WHITE_RIM_MIN_CHANNEL = 210.0
    WHITE_RIM_MAX_CHROMA = 20.0
    WHITE_RIM_MIN_RADIAL = 0.84

    LITHOPHANE_MIN_WALL_MM = 1.20
    LITHOPHANE_MAX_WALL_MM = 3.20
    LITHOPHANE_OPENING_LATITUDE_DEGREES = -72.0
    LAT_SEGMENTS = 84
    LON_SEGMENTS = 144

    @staticmethod
    def _font(size: int):
        """Use a readable bundled/system font, with old-Pillow-safe fallback."""
        try:
            return ImageFont.truetype("DejaVuSans.ttf", size=size)
        except OSError:
            try:
                return ImageFont.load_default(size=size)
            except TypeError:
                return ImageFont.load_default()

    def render_preview(self, planet: Planet, image_path: Path) -> bytes:
        """Return a transparent PNG preview using the projector projection contract."""
        source = Image.open(image_path).convert("RGB")
        preview = self._render_projector_mapped_sphere(source, planet)
        output = io.BytesIO()
        preview.save(output, format="PNG", compress_level=4)
        return output.getvalue()

    def render_print_sheet(self, planet: Planet, image_path: Path) -> bytes:
        source = Image.open(image_path).convert("RGB")
        sphere = self._render_projector_mapped_sphere(source, planet)
        drawing = source.copy()
        drawing.thumbnail((620, 620), Image.Resampling.LANCZOS)

        canvas = Image.new("RGB", (self.PRINT_WIDTH, self.PRINT_HEIGHT), "white")
        draw = ImageDraw.Draw(canvas)
        font = self._font(32)
        label_font = self._font(22)
        draw.text((70, 45), planet.display_name, fill="#111827", font=font)
        draw.text((70, 92), "Projector-mapped planet", fill="#4b5563", font=label_font)
        draw.text((895, 92), "Kid drawing", fill="#4b5563", font=label_font)
        canvas.paste(sphere, (60, 145), sphere)
        x = 895 + (620 - drawing.width) // 2
        y = 145 + (620 - drawing.height) // 2
        canvas.paste(drawing, (x, y))
        draw.rounded_rectangle((875, 130, 1535, 790), radius=24, outline="#d1d5db", width=3)
        draw.text(
            (70, 870),
            (
                f"Style: {planet.style}   Planet ID: {planet.id}   "
                f"Projection: {int(self.STROKE_WRAP_DEGREES)}° x "
                f"{int(self.STROKE_LATITUDE_DEGREES)}°"
            ),
            fill="#6b7280",
            font=label_font,
        )
        draw.text(
            (70, 915),
            "Kids Galaxy Projector · rendered by the Pi server",
            fill="#9ca3af",
            font=label_font,
        )
        output = io.BytesIO()
        canvas.save(output, format="PNG", compress_level=4)
        return output.getvalue()

    def render_print_pdf(self, planet: Planet, image_path: Path) -> bytes:
        """Return the Pi-rendered print sheet as a one-page PDF for Android printing."""
        png = self.render_print_sheet(planet, image_path)
        sheet = Image.open(io.BytesIO(png)).convert("RGB")
        output = io.BytesIO()
        sheet.save(output, format="PDF", resolution=150.0)
        return output.getvalue()

    def export_stl(self, planet: Planet, image_path: Path, diameter_mm: float) -> bytes:
        """Return a hollow spherical lithophane with a printable south-pole opening."""
        source = Image.open(image_path).convert("RGB")
        pixels, strength, bounds = self._artwork_analysis(source, planet)
        del pixels

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
                artwork = self._sample_artwork_strength(strength, bounds, latitude, longitude)
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
        header = (
            f"Kids Galaxy {planet.id} spherical lithophane "
            f"{int(self.STROKE_WRAP_DEGREES)}x{int(self.STROKE_LATITUDE_DEGREES)}"
        ).encode("ascii")[:80]
        output.write(header.ljust(80, b"\0"))
        output.write(struct.pack("<I", len(triangles)))
        for a, b, c in triangles:
            normal = self._normal(a, b, c)
            output.write(struct.pack("<12fH", *normal, *a, *b, *c, 0))
        return output.getvalue()

    def _preview_radius(self, planet: Planet) -> float:
        ratio = (
            self.RINGED_SPHERE_RADIUS_RATIO
            if planet.style == "ringed"
            else self.STANDARD_SPHERE_RADIUS_RATIO
        )
        return self.PREVIEW_SIZE * ratio

    def _render_projector_mapped_sphere(self, source: Image.Image, planet: Planet) -> Image.Image:
        size = self.PREVIEW_SIZE
        radius = self._preview_radius(planet)
        pixels, strength, bounds = self._artwork_analysis(source, planet)
        body = self._body_rgb(planet, pixels)

        yy, xx = np.mgrid[0:size, 0:size]
        nx = (xx - size / 2.0) / radius
        ny = (size / 2.0 - yy) / radius
        rr = nx * nx + ny * ny
        mask = rr <= 1.0
        nz = np.sqrt(np.clip(1.0 - rr, 0.0, 1.0))
        latitude = np.arcsin(np.clip(ny, -1.0, 1.0))
        longitude = np.arctan2(nx, nz)

        rgb = np.empty((size, size, 3), dtype=np.float32)
        rgb[:] = body
        best_strength = np.zeros((size, size), dtype=np.float32)

        min_x, max_x, min_y, max_y = bounds
        centre_x = (min_x + max_x) * 0.5
        centre_y = (min_y + max_y) * 0.5
        half_width = max(2.0, (max_x - min_x) * 0.5)
        half_height = max(2.0, (max_y - min_y) * 0.5)
        valid_latitude = np.abs(latitude) <= self.HALF_LATITUDE_RADIANS
        authored_y = np.clip(latitude / self.HALF_LATITUDE_RADIANS, -1.0, 1.0)

        for revolution in (-1, 0, 1):
            authored_x = (longitude + revolution * math.tau) / self.HALF_WRAP_RADIANS
            valid = mask & valid_latitude & (np.abs(authored_x) <= 1.0)
            if not np.any(valid):
                continue
            sx = np.rint(centre_x + authored_x * half_width).astype(np.int32)
            sy = np.rint(centre_y - authored_y * half_height).astype(np.int32)
            sx = np.clip(sx, 0, pixels.shape[1] - 1)
            sy = np.clip(sy, 0, pixels.shape[0] - 1)
            candidate_strength = strength[sy, sx]
            replace = valid & (candidate_strength > best_strength)
            if np.any(replace):
                rgb[replace] = pixels[sy[replace], sx[replace]]
                best_strength[replace] = candidate_strength[replace]

        light = np.array([-0.42, 0.55, 0.72], dtype=np.float32)
        light /= np.linalg.norm(light)
        diffuse = np.clip(nx * light[0] + ny * light[1] + nz * light[2], 0.0, 1.0)
        shade = 0.38 + diffuse * 0.72
        highlight = np.power(diffuse, 18) * 0.18
        rgb = np.clip(rgb * shade[..., None] + 255.0 * highlight[..., None], 0.0, 255.0)

        if planet.style == "cratered":
            crater = (nx + 0.28) ** 2 + (ny - 0.15) ** 2 < 0.13**2
            rgb[crater] *= 0.68

        alpha = (mask * 255).astype(np.uint8)
        sphere = Image.fromarray(np.dstack((rgb.astype(np.uint8), alpha)), "RGBA")
        if planet.style == "ringed":
            sphere = self._add_ring_preview(sphere, planet)
        return sphere

    def _add_ring_preview(self, sphere: Image.Image, planet: Planet) -> Image.Image:
        """Compose a ringed planet as a readable three-quarter export hero view."""
        size = sphere.width
        centre = size / 2.0
        radius = self._preview_radius(planet)
        major_radius = radius * self.RING_MAJOR_RADIUS_FACTOR
        minor_radius = radius * self.RING_MINOR_RADIUS_FACTOR
        ring_color = planet.ring_color if planet.ring_color else "#F4C95D"
        box = (
            centre - major_radius,
            centre - minor_radius,
            centre + major_radius,
            centre + minor_radius,
        )

        back = Image.new("RGBA", sphere.size, (0, 0, 0, 0))
        front = Image.new("RGBA", sphere.size, (0, 0, 0, 0))
        ImageDraw.Draw(back).arc(
            box,
            180,
            360,
            fill=ring_color,
            width=self.RING_STROKE_WIDTH,
        )
        ImageDraw.Draw(front).arc(
            box,
            0,
            180,
            fill=ring_color,
            width=self.RING_STROKE_WIDTH,
        )

        rotation = self.RING_ROLL_DEGREES
        rotation_centre = (centre, centre)
        back = back.rotate(
            rotation,
            resample=Image.Resampling.BICUBIC,
            center=rotation_centre,
        )
        front = front.rotate(
            rotation,
            resample=Image.Resampling.BICUBIC,
            center=rotation_centre,
        )

        back.alpha_composite(sphere)
        back.alpha_composite(front)
        return back

    def _artwork_analysis(
        self,
        source: Image.Image,
        planet: Planet,
    ) -> tuple[np.ndarray, np.ndarray, tuple[float, float, float, float]]:
        pixels = np.asarray(source).astype(np.float32)
        body = self._body_rgb(planet, pixels)
        distance = np.linalg.norm(pixels - body, axis=2)
        strength = np.clip(
            (distance - self.ARTWORK_DISTANCE_START)
            / (self.ARTWORK_DISTANCE_FULL - self.ARTWORK_DISTANCE_START),
            0.0,
            1.0,
        ).astype(np.float32)

        height, width, _ = pixels.shape
        yy, xx = np.mgrid[0:height, 0:width]
        cx = (width - 1) / 2.0
        cy = (height - 1) / 2.0
        radial = np.hypot((xx - cx) / max(cx, 1.0), (yy - cy) / max(cy, 1.0))
        minimum = pixels.min(axis=2)
        maximum = pixels.max(axis=2)
        near_white = (
            (minimum >= self.WHITE_RIM_MIN_CHANNEL)
            & ((maximum - minimum) <= self.WHITE_RIM_MAX_CHROMA)
            & (radial >= self.WHITE_RIM_MIN_RADIAL)
        )
        strength[near_white] = 0.0

        authored = strength > 0.08
        if np.any(authored):
            ys, xs = np.nonzero(authored)
            bounds = (float(xs.min()), float(xs.max()), float(ys.min()), float(ys.max()))
        else:
            bounds = (
                width * 0.25,
                width * 0.75,
                height * 0.25,
                height * 0.75,
            )
        return pixels, strength, bounds

    def _sample_artwork_strength(
        self,
        strength: np.ndarray,
        bounds: tuple[float, float, float, float],
        latitude: float,
        longitude: float,
    ) -> float:
        if abs(latitude) > self.HALF_LATITUDE_RADIANS:
            return 0.0

        min_x, max_x, min_y, max_y = bounds
        centre_x = (min_x + max_x) * 0.5
        centre_y = (min_y + max_y) * 0.5
        half_width = max(2.0, (max_x - min_x) * 0.5)
        half_height = max(2.0, (max_y - min_y) * 0.5)
        authored_y = max(-1.0, min(1.0, latitude / self.HALF_LATITUDE_RADIANS))
        sy = round(centre_y - authored_y * half_height)
        sy = min(strength.shape[0] - 1, max(0, sy))

        best = 0.0
        for revolution in (-1, 0, 1):
            authored_x = (longitude + revolution * math.tau) / self.HALF_WRAP_RADIANS
            if abs(authored_x) > 1.0:
                continue
            sx = round(centre_x + authored_x * half_width)
            sx = min(strength.shape[1] - 1, max(0, sx))
            best = max(best, float(strength[sy, sx]))
        return best

    def _body_rgb(self, planet: Planet, pixels: np.ndarray) -> np.ndarray:
        if planet.body_color and len(planet.body_color) == 7:
            return np.array(
                [int(planet.body_color[index : index + 2], 16) for index in (1, 3, 5)],
                dtype=np.float32,
            )
        edge = np.concatenate((pixels[0], pixels[-1], pixels[:, 0], pixels[:, -1]), axis=0)
        return np.median(edge.astype(np.float32), axis=0)

    def _shell_triangles(
        self,
        outer_rows: list[list[tuple[float, float, float]]],
        inner_rows: list[list[tuple[float, float, float]]],
    ) -> list[tuple[tuple[float, float, float], ...]]:
        triangles: list[tuple[tuple[float, float, float], ...]] = []
        last_lat = len(outer_rows) - 1
        for lat in range(last_lat):
            for lon in range(self.LON_SEGMENTS):
                nxt = (lon + 1) % self.LON_SEGMENTS
                oa = outer_rows[lat][lon]
                ob = outer_rows[lat + 1][lon]
                oc = outer_rows[lat + 1][nxt]
                od = outer_rows[lat][nxt]
                ia = inner_rows[lat][lon]
                ib = inner_rows[lat + 1][lon]
                ic = inner_rows[lat + 1][nxt]
                id_ = inner_rows[lat][nxt]
                if lat != last_lat - 1:
                    triangles.extend(((oa, ob, od), (od, ob, oc)))
                    triangles.extend(((ia, id_, ib), (id_, ic, ib)))

        for lon in range(self.LON_SEGMENTS):
            nxt = (lon + 1) % self.LON_SEGMENTS
            oa = outer_rows[0][lon]
            on = outer_rows[0][nxt]
            ia = inner_rows[0][lon]
            inn = inner_rows[0][nxt]
            triangles.extend(((oa, on, ia), (on, inn, ia)))

        outer_pole = outer_rows[-1][0]
        inner_pole = inner_rows[-1][0]
        ring_index = len(outer_rows) - 2
        for lon in range(self.LON_SEGMENTS):
            nxt = (lon + 1) % self.LON_SEGMENTS
            triangles.append((outer_rows[ring_index][lon], outer_pole, outer_rows[ring_index][nxt]))
            triangles.append((inner_rows[ring_index][nxt], inner_pole, inner_rows[ring_index][lon]))
        return triangles

    @staticmethod
    def _normal(a, b, c) -> tuple[float, float, float]:
        ux, uy, uz = (b[index] - a[index] for index in range(3))
        vx, vy, vz = (c[index] - a[index] for index in range(3))
        nx = uy * vz - uz * vy
        ny = uz * vx - ux * vz
        nz = ux * vy - uy * vx
        length = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
        return nx / length, ny / length, nz / length
