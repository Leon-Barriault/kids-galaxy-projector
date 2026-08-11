"""Printable planet exports for the volunteer manager tablet.

The STL is a single radial surface, so it stays watertight instead of exporting
intersecting Three.js meshes. Kid artwork becomes shallow positive relief and
cratered planets receive deterministic physical depressions.
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
    RELIEF_MM = 1.25
    LAT_SEGMENTS = 72
    LON_SEGMENTS = 120

    @staticmethod
    def _font(size: int):
        """Use a readable bundled/system font, with old-Pillow-safe fallback."""
        try:
            return ImageFont.truetype("DejaVuSans.ttf", size=size)
        except OSError:
            try:
                return ImageFont.load_default(size=size)
            except TypeError:
                # Pillow before load_default(size=...) still exists on older Pi images.
                return ImageFont.load_default()

    def render_print_sheet(self, planet: Planet, image_path: Path) -> bytes:
        source = Image.open(image_path).convert("RGB")
        sphere = self._render_sphere(source, planet)
        drawing = source.copy()
        drawing.thumbnail((620, 620), Image.Resampling.LANCZOS)

        canvas = Image.new("RGB", (self.PRINT_WIDTH, self.PRINT_HEIGHT), "white")
        draw = ImageDraw.Draw(canvas)
        font = self._font(32)
        label_font = self._font(22)
        draw.text((70, 45), planet.display_name, fill="#111827", font=font)
        draw.text((70, 92), "3D rendered planet", fill="#4b5563", font=label_font)
        draw.text((895, 92), "Kid drawing", fill="#4b5563", font=label_font)
        canvas.paste(sphere, (60, 145), sphere if sphere.mode == "RGBA" else None)
        x = 895 + (620 - drawing.width) // 2
        y = 145 + (620 - drawing.height) // 2
        canvas.paste(drawing, (x, y))
        draw.rounded_rectangle((875, 130, 1535, 790), radius=24, outline="#d1d5db", width=3)
        draw.text(
            (70, 870),
            f"Style: {planet.style}   Planet ID: {planet.id}",
            fill="#6b7280",
            font=label_font,
        )
        draw.text(
            (70, 915),
            "Kids Galaxy Projector · exported from the admin tablet",
            fill="#9ca3af",
            font=label_font,
        )
        output = io.BytesIO()
        # PNG optimize=True performs an expensive second compression search and
        # can exceed the Android read timeout on a Raspberry Pi. A modest fixed
        # compression level keeps the file compact while returning promptly.
        canvas.save(output, format="PNG", compress_level=4)
        return output.getvalue()

    def export_stl(self, planet: Planet, image_path: Path, diameter_mm: float) -> bytes:
        image = Image.open(image_path).convert("RGB")
        pixels = np.asarray(image)
        body = self._body_rgb(planet, pixels)
        radius = diameter_mm / 2.0
        vertices = self._sphere_vertices(planet, pixels, body, radius)
        triangles = self._sphere_triangles(vertices)

        output = io.BytesIO()
        header = f"Kids Galaxy {planet.id} watertight relief planet".encode("ascii")[:80]
        output.write(header.ljust(80, b"\0"))
        output.write(struct.pack("<I", len(triangles)))
        for a, b, c in triangles:
            normal = self._normal(a, b, c)
            output.write(struct.pack("<12fH", *normal, *a, *b, *c, 0))
        return output.getvalue()

    def _render_sphere(self, source: Image.Image, planet: Planet) -> Image.Image:
        size = 700
        radius = size * 0.44
        src = np.asarray(source.resize((512, 512), Image.Resampling.LANCZOS)).astype(np.float32)
        yy, xx = np.mgrid[0:size, 0:size]
        nx = (xx - size / 2) / radius
        ny = (size / 2 - yy) / radius
        rr = nx * nx + ny * ny
        mask = rr <= 1
        nz = np.sqrt(np.clip(1 - rr, 0, 1))
        sx = np.clip(((nx + 1) * 0.5 * 511).astype(int), 0, 511)
        sy = np.clip(((1 - (ny + 1) * 0.5) * 511).astype(int), 0, 511)
        sampled = src[sy, sx]

        light = np.array([-0.42, 0.55, 0.72], dtype=np.float32)
        light /= np.linalg.norm(light)
        diffuse = np.clip(nx * light[0] + ny * light[1] + nz * light[2], 0, 1)
        shade = 0.34 + diffuse * 0.78
        highlight = np.power(np.clip(diffuse, 0, 1), 16) * 0.22
        rgb = np.clip(sampled * shade[..., None] + 255 * highlight[..., None], 0, 255)

        if planet.style == "cratered":
            crater = (nx + 0.28) ** 2 + (ny - 0.15) ** 2 < 0.13**2
            rgb[crater] *= 0.62
        alpha = (mask * 255).astype(np.uint8)
        rgba = np.dstack((rgb.astype(np.uint8), alpha))
        return Image.fromarray(rgba, "RGBA")

    def _body_rgb(self, planet: Planet, pixels: np.ndarray) -> np.ndarray:
        if planet.body_color and len(planet.body_color) == 7:
            return np.array(
                [int(planet.body_color[index : index + 2], 16) for index in (1, 3, 5)],
                dtype=np.float32,
            )
        edge = np.concatenate((pixels[0], pixels[-1], pixels[:, 0], pixels[:, -1]), axis=0)
        return np.median(edge.astype(np.float32), axis=0)

    def _sphere_vertices(
        self,
        planet: Planet,
        pixels: np.ndarray,
        body: np.ndarray,
        radius: float,
    ) -> list[list[tuple[float, float, float]]]:
        rows: list[list[tuple[float, float, float]]] = []
        height, width, _ = pixels.shape
        for lat in range(self.LAT_SEGMENTS + 1):
            theta = math.pi * lat / self.LAT_SEGMENTS
            y = math.cos(theta)
            ring = math.sin(theta)
            row = []
            for lon in range(self.LON_SEGMENTS):
                phi = math.tau * lon / self.LON_SEGMENTS
                x = ring * math.cos(phi)
                z = ring * math.sin(phi)
                px = min(width - 1, max(0, round((x + 1) * 0.5 * (width - 1))))
                py = min(height - 1, max(0, round((1 - (y + 1) * 0.5) * (height - 1))))
                colour_distance = float(np.linalg.norm(pixels[py, px].astype(np.float32) - body))
                relief = self.RELIEF_MM if colour_distance > 38 else 0.0
                crater = self._crater_depth(planet, x, y, z, radius)
                r = radius + relief - crater
                row.append((x * r, y * r, z * r))
            rows.append(row)
        return rows

    def _crater_depth(self, planet: Planet, x: float, y: float, z: float, radius: float) -> float:
        if planet.style != "cratered":
            return 0.0
        centres = ((0.72, 0.24, 0.65), (-0.38, 0.77, 0.51), (0.25, -0.62, 0.74))
        deepest = 0.0
        for cx, cy, cz in centres:
            length = math.sqrt(cx * cx + cy * cy + cz * cz)
            dot = (x * cx + y * cy + z * cz) / length
            if dot <= 0.94:
                continue
            t = (dot - 0.94) / 0.06
            deepest = max(deepest, (t**1.4) * radius * 0.075)
        return deepest

    def _sphere_triangles(
        self,
        rows: list[list[tuple[float, float, float]]],
    ) -> list[tuple[tuple[float, float, float], ...]]:
        triangles = []
        for lat in range(self.LAT_SEGMENTS):
            for lon in range(self.LON_SEGMENTS):
                nxt = (lon + 1) % self.LON_SEGMENTS
                a = rows[lat][lon]
                b = rows[lat + 1][lon]
                c = rows[lat + 1][nxt]
                d = rows[lat][nxt]
                if lat != 0:
                    triangles.append((a, b, d))
                if lat != self.LAT_SEGMENTS - 1:
                    triangles.append((d, b, c))
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
