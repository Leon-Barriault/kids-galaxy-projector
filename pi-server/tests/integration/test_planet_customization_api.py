def test_upload_persists_style_and_companions(client, make_png_bytes):
    response = client.post(
        "/api/upload",
        files={"file": ("planet.png", make_png_bytes(), "image/png")},
        data={
            "name": "Adventure World",
            "style": "spiky",
            "companions": "moon,stars,satellite,astronaut",
        },
    )

    assert response.status_code == 200
    assert response.json()["style"] == "spiky"
    assert response.json()["companions"] == ["moon", "stars", "satellite", "astronaut"]

    scene = client.get("/api/scene")
    assert scene.status_code == 200
    planet = scene.json()["planets"][0]
    assert planet["style"] == "spiky"
    assert planet["companions"] == ["moon", "stars", "satellite", "astronaut"]


def test_ring_color_round_trips_to_scene(client, make_png_bytes):
    response = client.post(
        "/api/upload",
        files={"file": ("planet.png", make_png_bytes(), "image/png")},
        data={
            "name": "Blue Rings",
            "style": "ringed",
            "ring_color": "#4FC3F7",
        },
    )

    assert response.status_code == 200
    assert response.json()["ring_color"] == "#4fc3f7"

    scene = client.get("/api/scene")
    assert scene.status_code == 200
    planet = scene.json()["planets"][0]
    assert planet["style"] == "ringed"
    assert planet["ring_color"] == "#4fc3f7"


def test_crater_color_round_trips_to_scene(client, make_png_bytes):
    response = client.post(
        "/api/upload",
        files={"file": ("planet.png", make_png_bytes(), "image/png")},
        data={
            "name": "Purple Craters",
            "style": "cratered",
            "crater_color": "#AB47BC",
        },
    )

    assert response.status_code == 200
    assert response.json()["crater_color"] == "#ab47bc"

    scene = client.get("/api/scene")
    assert scene.status_code == 200
    planet = scene.json()["planets"][0]
    assert planet["style"] == "cratered"
    assert planet["crater_color"] == "#ab47bc"


def test_mountain_color_round_trips_to_scene(client, make_png_bytes):
    response = client.post(
        "/api/upload",
        files={"file": ("planet.png", make_png_bytes(), "image/png")},
        data={
            "name": "Green Peaks",
            "style": "spiky",
            "mountain_color": "#66BB6A",
        },
    )

    assert response.status_code == 200
    assert response.json()["mountain_color"] == "#66bb6a"

    scene = client.get("/api/scene")
    assert scene.status_code == 200
    planet = scene.json()["planets"][0]
    assert planet["style"] == "spiky"
    assert planet["mountain_color"] == "#66bb6a"


def test_upload_rejects_unknown_design_choices(client, make_png_bytes):
    bad_style = client.post(
        "/api/upload",
        files={"file": ("planet.png", make_png_bytes(), "image/png")},
        data={"name": "Odd", "style": "cube"},
    )
    assert bad_style.status_code == 400

    bad_friend = client.post(
        "/api/upload",
        files={"file": ("planet.png", make_png_bytes(), "image/png")},
        data={"name": "Odd", "companions": "moon,dragon"},
    )
    assert bad_friend.status_code == 400

    for field in ("ring_color", "crater_color", "mountain_color"):
        bad_color = client.post(
            "/api/upload",
            files={"file": ("planet.png", make_png_bytes(), "image/png")},
            data={"name": "Odd", field: "rainbow"},
        )
        assert bad_color.status_code == 400
