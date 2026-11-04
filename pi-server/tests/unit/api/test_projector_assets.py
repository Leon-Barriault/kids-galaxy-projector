import os

from app.api.projector_assets import BuildFingerprint, render_projector_page

INDEX = """<!doctype html>
<html>
<head>
  <link rel="icon" type="image/svg+xml" href="/static/favicon.svg" />
</head>
<body>
  <script type="importmap">
  { "imports": {
    "three": "/static/vendor/three.module.js",
    "three/addons/": "/static/vendor/jsm/"
  } }
  </script>
  <script type="module" src="/static/galaxy.js"></script>
</body>
</html>
"""


def static_tree(tmp_path):
    root = tmp_path / "static"
    (root / "projector").mkdir(parents=True)
    (root / "galaxy.js").write_text("export {};\n", encoding="utf-8")
    (root / "projector" / "PlanetLoader.js").write_text("export {};\n", encoding="utf-8")
    return root


def test_fingerprint_is_stable_while_nothing_changes(tmp_path):
    root = static_tree(tmp_path)

    assert BuildFingerprint(root, ttl_seconds=0).current() == BuildFingerprint(root).current()


def test_fingerprint_changes_when_any_projector_file_changes(tmp_path):
    root = static_tree(tmp_path)
    fingerprint = BuildFingerprint(root, ttl_seconds=0)
    before = fingerprint.current()

    module = root / "projector" / "PlanetLoader.js"
    module.write_text("export const updated = true;\n", encoding="utf-8")
    stat = module.stat()
    os.utime(module, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000_000))

    assert fingerprint.current() != before


def test_page_loads_every_asset_from_the_current_build(tmp_path):
    page = render_projector_page(INDEX, "abc123")

    assert 'src="/static/r/abc123/galaxy.js"' in page
    assert '"three": "/static/r/abc123/vendor/three.module.js"' in page
    assert '"three/addons/": "/static/r/abc123/vendor/jsm/"' in page
    assert 'href="/static/r/abc123/favicon.svg"' in page
    assert '"/static/galaxy.js"' not in page


def test_page_tells_the_projector_which_build_it_is(tmp_path):
    page = render_projector_page(INDEX, "abc123")

    assert '<meta name="kids-galaxy-build" content="abc123" />' in page
    assert page.index("kids-galaxy-build") < page.index("</head>")
