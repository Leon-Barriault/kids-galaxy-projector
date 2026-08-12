# Handoff — planet appearance, printing, and the freeze

State as of the last commit on this branch. Written so a session started fresh
(with push access to the repo) can carry on without re-deriving any of it.

## Where things stand

`origin/main` is at `ebcba0f`. Local `main` is ahead of it by the freeze fix and
the stroke-projection change, **neither of which has been pushed** — push them or
review them first, but do not assume the remote has them.

CI is still unconfirmed, and it needs a look rather than an assumption: GitHub
shows **no check runs at all against `e3c69fb`**, and the newest run on the
Actions page is for a commit 585 back in `main`'s history. All three workflows
trigger on `push` to `main` with no path filters, so runs should exist for every
commit since. Actions being disabled on the repository fits that better than
anything specific to this commit. Settle it before trusting a green tree.

Everything below passes at that commit locally: five projector acceptance
scripts, 391 Python tests, ruff, and the architecture boundary checks.

## Line endings — pinned and committed

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

Both are committed, in `ebcba0f`.

The aftermath is worth recording, because the previous note here diagnosed it
wrongly. Adding `.gitattributes` left all 233 files showing as modified with
**empty diffs**, and that was not "git cannot write the index through the mount".
It was renormalisation: `core.autocrlf` was `true` on this machine, the new
`eol=lf` attribute disagreed with it, and git kept flagging every file as pending
conversion even though the bytes on disk were already LF. `git add --refresh` does
not clear it and neither does rebuilding the index from `HEAD`; `git add
--renormalize .` does, and stages nothing, because nothing genuinely differs.
`core.autocrlf` is now `false` globally on this machine so it does not recur.

Still true, and separate: in a cloud session with the repo on a mounted Windows
disk, files can be created and renamed but **not deleted**. Git needs to unlink
`.git/index.lock` after every write, so every git command leaves a stale lock
that blocks the next one. Run git through PowerShell on the host rather than
through the mount. `git diff --name-only` remains the honest answer for what
actually changed.

## The freeze — found, and it was neither earlier guess

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

Neither was it. Both are real bugs and both stay fixed, but the freeze was not a
memory problem at all — which the evidence had been saying all along, because a
lost context logs `WebGL context lost` and nothing was ever logged.

`capture()` held the renderer's render target across an `await`. PNG encoding ran
inside the `try`, so the `finally` that restores the target did not run until
`canvas.toBlob` resolved, and every animation frame landing in that window drew
into the offscreen 700×700 target instead of the canvas. On top of that, captures
were never serialised: `schedule()` keys its debounce per entity, so twelve
planets finishing their texture loads inside the same 60 ms window ran twelve
captures at once, each saving another's target as "previous" and restoring one
that had already been disposed. The renderer ends up bound to a dead target and
every later frame goes into it.

Both are silent. The scene graph stays correct, the animation loop keeps running,
nothing reaches the console — only the picture stops. That is exactly why every
headless script passed: they all assert scene state, and scene state was fine.
A twelve-planet harness against the pre-fix file put 19 of 20 frames offscreen
and finished bound to a disposed target.

Encoding now happens after the renderer is restored, and captures run one at a
time through a promise queue. `scripts/check_projector_live_after_snapshot.py`
guards it by the symptom rather than the mechanism: `getRenderTarget()` must be
null once captures settle, and two screenshots of the live canvas must differ.

**If it still freezes**, the browser console is still the fastest discriminator.
A red error points at an exception; `WebGL context lost` would point back at
memory. `window.kidsGalaxySoftToyFailures` is `undefined` when the surface stage
is healthy and an array of reasons when it is not.

## How a drawing becomes a planet

`pi-server/static/projector/SoftToyPlanetSurface.js` is the last stage in
the pipeline and owns planet appearance. The rule: the colour the child picks is
the sphere, and every stroke they draw keeps its shape and is wrapped around the
planet at the height they drew it.

That is a change from "every line becomes a band right around the planet at the
height they drew it", and it was made because the old rule only held for the
rainbow it was written against. Collapsing each row of the drawing to one colour
threw orientation away before anything else happened, so a stroke owned every row
it touched. Measured: a vertical line turned **85%** of the planet its colour, a
diagonal **78%**, a wobbly line came back six times thicker than drawn — and
anything thinner than about ten pixels was discarded as a slip of the finger.
There was no middle setting. The drawing either vanished or took over.

A horizontal line is still a band right round the planet, so the rainbow is
unchanged. What is new is that a wavy line stays wavy as it goes round, and a
line drawn top to bottom spirals from pole to pole.

Decisions in there that look arbitrary and are not:

- **Strokes are found before anything is measured.** Connected paint of about one
  colour is one stroke, and its extent, orientation and centreline are what decide
  how it wraps. None of those can be recovered a row at a time.
- **A stroke's longitude comes from its long axis.** Wide strokes are walked left
  to right, tall ones top to bottom. That is the whole reason a vertical line
  spirals instead of claiming every latitude it crosses.
- **Sampled backwards, per texel of the output.** Forwards leaves holes: a stroke
  stretched from 200 drawing pixels to 512 columns visits 200 of them, and the
  line arrives combed into vertical stripes with background between them.
- **A pole is capped only when paint actually reaches it**, within 4% of the
  drawing's edge — the top twenty rows of 512, where the tablet's circular clip
  has narrowed the drawable width to about a fifth of the disc, so paint landing
  there was aimed at the top. The cap *closes around* the stroke rather than
  overwriting whole rows: a stroke drawn over the top reaches row 0 only across
  the longitudes it happens to cross, and replacing the row would erase the
  stroke while leaving the gaps beside it.
  This reverses the earlier rule, which extended the topmost colour to the pole
  unconditionally. That was inherited from the per-row version and it is right
  for a stroke drawn over the pole and wrong for everything else: a rainbow whose
  apex sits a third of the way down left the whole northern hemisphere purple,
  and so did a wavy line across the middle. Untouched canvas above or below a
  drawing is a pale pole and is meant to show.
- **Stroke thickness comes from the colour, not from stroke order.** Same green,
  same thickness, every render. Three discrete tiers rather than a continuum,
  because distinct thicknesses read as layering where a gradient reads as an
  uneven surface.
- **The shoulder is a real 2D distance to the nearest unpainted texel.** So the
  *end* of a stroke is bevelled exactly like its sides. The row profile this
  replaced could only bevel a band's top and bottom, which was invisibly correct
  while every stroke ran the whole way round and wrong the moment one had ends.
  It wraps in longitude and clamps in latitude: the row above the north pole is
  the pole, not empty space, and treating it as an edge dents the cap.
- **The texture is 512×256, not 8 px wide.** Longitude carries information now,
  so it can no longer be one column repeated. 512 is the narrowest that holds a
  512px drawing without stair-stepping a diagonal; 1024 would be the ~72 MB
  across a full gallery that the previous note rightly warned about.
- **`MeshPhysicalMaterial`, not `MeshStandardMaterial`.** Partly for the
  clearcoat the moulded look needs, and partly because `ReferenceFinish` sets
  `material.sheen` and `material.sheenColor`, which the standard material does
  not have.
- **`SHOULDER_TEXELS` has to be read against the geometry.** The body sphere has
  72 height segments across 256 texture rows, so one vertex row spans about 3.5
  texels; a shoulder under ~4 is quantised into a single step and the bevel
  exists only in the bump map.

Appearance is asserted by `scripts/check_drawing_projection.py`, which replaced
`check_latitude_band_projection.py`, which replaced five scripts that asserted
the sculpted-slab architecture before it. None could be repaired, always for the
same reason: each pinned the appearance being complained about. Its colour
classifier matches on colour *direction*, not absolute distance: stroke edges are
darkened by a uniform multiply, and yellow at 78% measures nearer to full orange
than to full yellow. It also collapses a column into *runs* and drops short ones
rather than filtering by a colour's total share — the rainbow's arcs are 44px
strokes spaced 50px apart, so the drawing genuinely has a one-row sliver of
background between each pair, and a total-share filter cannot tell those from the
nineteen rows of south pole.

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
    python3.12 scripts/check_drawing_projection.py
    python3.12 scripts/check_projector_live_after_snapshot.py
    python3.12 scripts/check_webgl_export_snapshot.py
    python3.12 scripts/check_ring_color_fidelity.py
    python3.12 scripts/check_spherical_projection_and_astronauts.py

Python 3.12 is required, not 3.11 — the code uses PEP 695 `type X = ...`.

## Still open

- CI. No check runs for `e3c69fb`, and none for roughly the last 585 commits
  either. Nothing about that is specific to the projector work — check whether
  Actions is disabled on the repository.
- The freeze is diagnosed and fixed; what is unconfirmed is only whether the
  projector on the actual Pi agrees. See the section above.
- Projector hygiene, never started: polling never stops, particles are rebuilt
  every 2.5 s so snow teleports, and there is a large amount of unreachable code
  left behind by successive rewrites of the surface pipeline.
- Holiday ideas the product owner was open to and nobody has built: class-photo
  mode, an end-of-day time-lapse, a birthday mode, aurora over the poles.
