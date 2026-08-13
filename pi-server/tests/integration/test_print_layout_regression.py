"""Regression coverage for the kid-facing print layout."""

import io

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
