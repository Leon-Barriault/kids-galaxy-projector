# Handoff — planet appearance, printing, and one unconfirmed freeze

State as of the last commit on this branch. Written so a session started fresh
(with push access to the repo) can carry on without re-deriving any of it.

## Where things stand

`origin/main`, local `main` and `HEAD` are all at `e3c69fb`. Nothing is waiting
to be pushed. The four unpushed commits that the previous version of this file
described are gone: they were reworked before being pushed, so `940ba59`,
`67e3b4b`, `8113a30` and `5d50814` no longer exist. What sits after `4334373` is
three commits — `3cba327`, `ec7e612`, `e3c69fb`.

CI is still unconfirmed, and it needs a look rather than an assumption: GitHub
shows **no check runs at all against `e3c69fb`**, and the newest run on the
Actions page is for a commit 585 back in `main`'s history. All three workflows
trigger on `push` to `main` with no path filters, so runs should exist for every
commit since. Actions being disabled on the repository fits that better than
anything specific to this commit. Settle it before trusting a green tree.

Everything below passes at that commit locally: five projector acceptance
scripts, 391 Python tests, ruff, and the architecture boundary checks.

## Line endings — pinned, one commit still to make

The repository had no `.gitattributes`, so line-ending behaviour depended on
whatever `core.autocrlf` each machine happened to have. Committed blobs were
already LF throughout — the single exception, `android/gradlew.bat`, is correctly
CRLF and is vendored by the Gradle wrapper. The risk was prospective rather than
present: a clone made with `autocrlf` off would commit CRLF into
`scripts/start_kiosk.sh` or `pi-server/certs/generate_certs.sh`, and those reach
the Pi as `bad interpreter: /bin/bash^M`.

`.gitattributes` now pins it: `* text=auto eol=lf`, LF forced explicitly for
`*.sh`, `gradlew`, `Makefile` and Dockerfiles, `*.bat`/`*.cmd` frozen as
committed so the vendored wrapper is not rewritten, and binaries marked. The 233
working-tree files that were CRLF have been rewritten to LF byte-for-byte from
their own committed blobs, so no committed content changed.

**`.gitattributes` and this file are not committed yet:**

    git add .gitattributes HANDOFF.md
    git commit -m "chore: pin line endings with .gitattributes; docs: correct handoff state"

Two notes for whoever picks this up in a cloud session with the repo on a mounted
Windows disk. `git status` there reports every file modified and cannot be
trusted, because git cannot write the index through the mount; `git diff
--name-only` does the content comparison and is the honest answer. And a
`_to_delete/` folder at the repo root holds stale `.git/index.lock` files that
the same restriction prevented removing in place — delete it.

## The one thing that is not confirmed fixed

The projector froze a second or two after a planet's preview was published. It
was never reproduced headlessly — one, three and twelve planets, ringed,
cratered and spiky, all kept orbiting with no console errors. Two fixes went in
against the *mechanism* rather than an observed repro, the second of which fits
the reported timing exactly:

- `ProjectorSnapshotPublisher` cloned the sun light into its throwaway export
  scene. `Object3D.clone()` shares geometry and material, but `Light.copy()`
  gives the clone its own `LightShadow`, and a shadow-casting point light
  allocates a six-face cube shadow map. Nothing disposed it, so every published
  preview leaked one. Twelve planets leak twelve; enough of those exhausts GPU
  memory and the WebGL context is lost, at which point the last frame stays on
  screen and the galaxy looks frozen. The export light no longer casts, and the
  scene is disposed afterwards — shared geometry and materials deliberately left
  alone, since disposing those would strip the live planet.
- `PMREMGenerator` moves the renderer's render target, viewport and scissor.
  This projector scales its internal resolution, so those are not defaults that
  come back by luck; left changed, later frames draw into the wrong rectangle.
  Environment prefiltering now brackets that state.

**If it still freezes**, the fastest discriminator is the browser console on the
projector page. A red error points at an exception; `WebGL context lost` points
at memory and means the leak hunt is not finished. `window.kidsGalaxySoftToyFailures`
is `undefined` when the surface stage is healthy and an array of reasons when it
is not.

## How a drawing becomes a planet

`pi-server/static/projector/SoftToyPlanetSurface.js` is the last stage in
the pipeline and owns planet appearance. The rule, in the product owner's words:
the colour the child picks is the sphere, and every line they draw becomes a band
right around the planet at the height they drew it.

Decisions in there that look arbitrary and are not:

- **Band colour is the paint nearest the middle of the drawing at that height.**
  Not the row average, not the row's most common colour. A horizontal line low
  through a rainbow crosses every colour twice, so averaging gives brown and
  most-common gives whichever arc is widest there — the outermost one — which
  inverts the order.
- **The topmost band covers the whole north pole.** Arcing paint over the top of
  the disc leaves untouched canvas above the apex; a child reads that arc as the
  top of their planet, not as a stripe under a cap of background. There is no
  equivalent at the bottom on purpose: unpainted canvas below the drawing is the
  south pole, and it is meant to show.
- **Band thickness comes from the colour, not from band order.** Same green,
  same thickness, every render. Three discrete tiers rather than a continuum,
  because distinct thicknesses read as layering where a gradient reads as an
  uneven surface.
- **A band touching row 0 or the last row gets no shoulder on that side.** It is
  the pole; bevelling there dents and darkens the middle of the cap.
- **The texture is 8 px wide.** Bands are constant in longitude, so width stores
  one colour thousands of times per row. At 1024 it was ~72 MB of canvas across a
  full gallery, and as much again in texture memory, for no visible difference.
- **`MeshPhysicalMaterial`, not `MeshStandardMaterial`.** Partly for the
  clearcoat the moulded look needs, and partly because `ReferenceFinish` sets
  `material.sheen` and `material.sheenColor`, which the standard material does
  not have.
- **`BAND_SHOULDER_ROWS` has to be read against the geometry.** The body sphere
  has 72 height segments, so one vertex row spans about seven texture rows; a
  shoulder under ~15 rows is quantised into a single step and the bevel exists
  only in the bump map.

Appearance is asserted by `scripts/check_latitude_band_projection.py`, which
replaced five scripts that asserted the previous sculpted-slab architecture.
Those could not be repaired because they pinned the appearance being complained
about. Its colour classifier matches on colour *direction*, not absolute
distance: band edges are darkened by a uniform multiply, and yellow at 78%
measures nearer to full orange than to full yellow.

`scripts/capture_planet_look.py` drives the real projector in headless Chromium
and writes the hero frames out. Use it before and after any appearance change —
the 480-degree winding that started all of this was found by looking at a
picture, after a lot of fruitless reading of the code.

Its test drawings must match what the tablet actually sends:
`AndroidPlanetTextureRenderer` fills the whole square with the body colour and
clips strokes to the inscribed circle. A disc-on-white stand-in invents a
background the projector never receives. The rainbow must be true concentric
semicircles — tall narrow ellipses make the innermost colour the nearest paint to
the centre over a huge vertical range, and green swallows a third of the planet.

## Printing

Printing used to answer 409 until the projector browser had published a WebGL
frame for that exact planet, and the manager polled it forty times at 250 ms
before showing "HTTP 409" — a ten-second freeze then an error. Three ordinary
situations make that render never arrive: nobody has the projector page open, the
planet sits past the twelfth while the manager lists thirty, or the parent prints
in the second between upload and capture. Printing now always returns a sheet and
declares its source in `X-Kids-Galaxy-Render-Source`, with the sheet captioned to
match. Do not reintroduce a hard requirement on the projector.

## Known-good verification loop

    cd pi-server && PYTHONPATH=. python3.12 -m pytest tests/ -q
    make lint && make arch
    python3.12 scripts/check_projector.py
    python3.12 scripts/check_latitude_band_projection.py
    python3.12 scripts/check_webgl_export_snapshot.py
    python3.12 scripts/check_ring_color_fidelity.py
    python3.12 scripts/check_spherical_projection_and_astronauts.py

Python 3.12 is required, not 3.11 — the code uses PEP 695 `type X = ...`.

## Still open

- CI. No check runs for `e3c69fb`, and none for roughly the last 585 commits
  either. Nothing about that is specific to the projector work — check whether
  Actions is disabled on the repository.
- The freeze, above. Unconfirmed either way.
- Projector hygiene, never started: polling never stops, particles are rebuilt
  every 2.5 s so snow teleports, and there is a large amount of unreachable code
  left behind by successive rewrites of the surface pipeline.
- Holiday ideas the product owner was open to and nobody has built: class-photo
  mode, an end-of-day time-lapse, a birthday mode, aurora over the poles.
