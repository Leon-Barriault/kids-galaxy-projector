"""The wall must always run the projector code the server is serving.

The wall is a kiosk browser that stays open for days. Without explicit cache
headers it reuses cached ES modules after an update, so a new rendering can be
switched on from the manager tablet and never appear.
"""

from fastapi.testclient import TestClient

from app.config import Settings
from app.factory import create_app

INDEX = """<!doctype html>
<html>
<head><title>Kids Galaxy</title></head>
<body>
<script type="importmap">{ "imports": { "three": "/static/vendor/three.module.js" } }</script>
<script type="module" src="/static/galaxy.js"></script>
</body>
</html>
"""


def client_for(tmp_path):
    static = tmp_path / "static"
    (static / "vendor").mkdir(parents=True)
    (static / "index.html").write_text(INDEX, encoding="utf-8")
    # Bytes, not text: on Windows write_text would turn the newline into CRLF.
    (static / "galaxy.js").write_bytes(b"export const wall = 'current';\n")
    (static / "vendor" / "three.module.js").write_text("export {};\n", encoding="utf-8")
    settings = Settings(
        upload_dir=tmp_path / "uploads",
        state_dir=tmp_path / "state",
        static_dir=static,
        rate_limit_seconds=0.0,
    )
    return TestClient(create_app(settings))


def build_of(page: str) -> str:
    marker = 'name="kids-galaxy-build" content="'
    start = page.index(marker) + len(marker)
    return page[start : page.index('"', start)]


def test_projector_page_is_always_revalidated(tmp_path):
    response = client_for(tmp_path).get("/")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-cache"


def test_projector_page_loads_its_modules_from_the_current_build(tmp_path):
    client = client_for(tmp_path)
    page = client.get("/").text
    build = build_of(page)

    assert f'src="/static/r/{build}/galaxy.js"' in page
    module = client.get(f"/static/r/{build}/galaxy.js")
    assert module.status_code == 200
    assert module.text == "export const wall = 'current';\n"
    assert module.headers["cache-control"] == "no-cache"


def test_unversioned_static_files_are_revalidated_too(tmp_path):
    response = client_for(tmp_path).get("/static/galaxy.js")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-cache"


def test_revalidation_of_an_unchanged_module_is_a_cheap_304(tmp_path):
    client = client_for(tmp_path)
    first = client.get("/static/galaxy.js")

    again = client.get("/static/galaxy.js", headers={"If-None-Match": first.headers["etag"]})

    assert again.status_code == 304
    assert again.headers["cache-control"] == "no-cache"


def test_gallery_tells_an_open_wall_which_build_is_current(tmp_path):
    client = client_for(tmp_path)
    build = build_of(client.get("/").text)

    response = client.get("/api/planets")

    assert response.status_code == 200
    assert response.headers["x-kids-galaxy-build"] == build


def test_versioned_paths_cannot_escape_the_static_directory(tmp_path):
    client = client_for(tmp_path)
    (tmp_path / "secret.txt").write_text("not for the wall", encoding="utf-8")

    response = client.get("/static/r/abc/../../secret.txt")

    assert response.status_code == 404
