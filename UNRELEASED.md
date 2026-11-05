# Unreleased

Work integrated on `develop` and not yet promoted through a release branch.
Keep this file in [Keep a Changelog](https://keepachangelog.com/) form.
Move a version section into [CHANGELOG.md](CHANGELOG.md) when `release/x.y.z`
is cut, then leave a fresh `Unreleased` heading behind.

## Unreleased

### Added

- A small shuttle follows the mouse on the galaxy wall. The page hides the
  system cursor, which left anyone steering the wall with a mouse with nothing
  to follow. The shuttle's nose is the pointer; it turns toward where it is
  heading, fires its engine while moving, and fades out a few seconds after the
  mouse rests or leaves the window. Touch input never shows it.

### Fixed

- The wall could keep showing the old planet rendering after **Planet look**
  was switched to **Like the drawing**. Two causes, both fixed. The kiosk
  browser reused cached projector code after an update, because static files
  were served without cache headers; they are now revalidated on every load and
  versioned per build, and an open wall reloads itself once when the server
  starts serving a newer projector. Separately, a behavior refresh that was
  already in flight when the switch arrived could land afterwards and put
  classic back; stale refreshes are now dropped.

### Added

- **Planet look** on the manager tablet's Galaxy tab. **Classic** keeps the
  current rendering: the canvas is read as a world map, wide marks wrap round
  the planet and the polar twist swirls it. **Like the drawing** reads the disc
  the child painted in as the face of the planet, so the drawing is what the
  room sees from the front and its mirror image covers the back; a stripe across
  the disc still closes into a ring. Switching rebuilds the planets already on
  the wall without celebrating them again. Stored as `planet_rendering`
  (`classic` | `front-view`) in the galaxy behavior; it defaults to classic, and
  older manager builds that do not send it keep working.
