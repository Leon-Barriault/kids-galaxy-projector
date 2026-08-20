"""Regression coverage for the kid-facing print layout."""

import io
import re

from PIL import Image, ImageChops, ImageDraw


def _kid_drawing_png() -> bytes:
    image = Image.new("RGB", (256, 256), "#4FC3F7")
    draw = ImageDraw.Draw(image)
    draw.line((55, 70, 205, 185), fill="#E53935", width=18)
    draw.ellipse((100, 90, 145, 135), outline="#FFFFFF", width=9)
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def _upload_drawing(client):
    response = client.post(
        "/api/upload",
        files={"file": ("planet.png", _kid_drawing_png(), "image/png")},
        data={
            "name": "Printed Drawing",
            "style": "classic",
            "body_color": "#4FC3F7",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def _visible_centroid(image: Image.Image) -> tuple[float, float] | None:
    white = Image.new("RGB", image.size, "white")
    mask = ImageChops.difference(image.convert("RGB"), white).convert("L")
    mask = mask.point(lambda value: 255 if value >= 8 else 0)
    width, _ = mask.size
    total = 0
    x_total = 0
    y_total = 0
    for index, value in enumerate(mask.getdata()):
        if not value:
            continue
        total += 1
        x_total += index % width
        y_total += index // width
    if not total:
        return None
    return x_total / total, y_total / total


def test_print_keeps_child_drawing_inside_tablet_circle(client):
    planet = _upload_drawing(client)

    response = client.get(f"/api/admin/planets/{planet['planet_id']}/print.png")

    assert response.status_code == 200
    sheet = Image.open(io.BytesIO(response.content)).convert("RGB")
    drawing = sheet.crop((895, 145, 1515, 765))

    # The paper outside the tablet's 42%-radius guide stays white rather than
    # printing the square body-colour backing used by the WebGL source texture.
    assert drawing.getpixel((5, 5)) == (255, 255, 255)

    # The guide itself matches the soft-blue circle shown on the kids tablet.
    # 620 * 0.42 = 260.4, so its top is approximately y=50.
    assert drawing.getpixel((310, 50)) == (100, 181, 246)

    # Most importantly, the child's authored red stroke is still present inside
    # that circle. PR #19 accidentally replaced all artwork with a blank guide.
    red_pixels = sum(
        1
        for red, green, blue in drawing.getdata()
        if red > 190 and green < 110 and blue < 110
    )
    assert red_pixels > 1_000


def test_print_recentres_an_off_axis_webgl_snapshot(client, upload_planet):
    planet = upload_planet(name="Off Axis Hero")
    snapshot = Image.new("RGBA", (700, 700), (0, 0, 0, 0))
    ImageDraw.Draw(snapshot).ellipse(
        (470, 20, 690, 240),
        fill="#4FC3F7",
        outline="#9BE4FF",
        width=8,
    )
    png = io.BytesIO()
    snapshot.save(png, format="PNG")

    stored = client.put(
        f"/api/admin/planets/{planet['planet_id']}/rendered-preview.png",
        content=png.getvalue(),
        headers={"Content-Type": "image/png"},
    )
    assert stored.status_code == 200, stored.text

    response = client.get(f"/api/admin/planets/{planet['planet_id']}/print.png")

    assert response.status_code == 200
    sheet = Image.open(io.BytesIO(response.content)).convert("RGB")
    hero = sheet.crop((60, 145, 760, 845))
    white = Image.new("RGB", hero.size, "white")
    bounds = ImageChops.difference(hero, white).getbbox()
    assert bounds is not None

    left, top, right, bottom = bounds
    centre_x = (left + right) / 2
    centre_y = (top + bottom) / 2
    assert 335 <= centre_x <= 365
    assert 335 <= centre_y <= 365
    assert left >= 34
    assert top >= 34
    assert right <= 666
    assert bottom <= 666


def test_print_optically_centres_planet_when_small_decoration_skews_bounds(
    client,
    upload_planet,
):
    planet = upload_planet(name="Optically Centred Hero")
    snapshot = Image.new("RGBA", (700, 700), (0, 0, 0, 0))
    draw = ImageDraw.Draw(snapshot)
    # The large planet body carries nearly all of the visible mass. A small
    # detached decoration extends the bounding box to the left. Bounding-box
    # centring alone therefore leaves the body visibly right-shifted on paper.
    draw.ellipse((350, 230, 570, 450), fill="#EF4444")
    draw.rectangle((240, 300, 260, 320), fill="#22C55E")
    png = io.BytesIO()
    snapshot.save(png, format="PNG")

    stored = client.put(
        f"/api/admin/planets/{planet['planet_id']}/rendered-preview.png",
        content=png.getvalue(),
        headers={"Content-Type": "image/png"},
    )
    assert stored.status_code == 200, stored.text

    response = client.get(f"/api/admin/planets/{planet['planet_id']}/print.png")

    assert response.status_code == 200
    sheet = Image.open(io.BytesIO(response.content)).convert("RGB")
    hero = sheet.crop((60, 145, 760, 845))
    centroid = _visible_centroid(hero)
    assert centroid is not None
    centre_x, centre_y = centroid
    assert 342 <= centre_x <= 358
    assert 342 <= centre_y <= 358


def test_print_pdf_is_standard_letter_landscape(client, upload_planet):
    planet = upload_planet(name="Letter PDF")

    response = client.get(f"/api/admin/planets/{planet['planet_id']}/print.pdf")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    match = re.search(
        rb"/MediaBox\s*\[\s*0(?:\.0)?\s+0(?:\.0)?\s+([0-9.]+)\s+([0-9.]+)\s*\]",
        response.content,
    )
    assert match is not None
    width_points = float(match.group(1))
    height_points = float(match.group(2))
    # 11 x 8.5 inches at 72 PDF points per inch.
    assert width_points == 792.0
    assert height_points == 612.0
