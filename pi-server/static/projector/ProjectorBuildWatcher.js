/**
 * Reload the wall when the server starts serving a different projector.
 *
 * The wall is a kiosk browser that stays open for days. When the galaxy program
 * is updated, the live stream drops and reconnects, and the page carries on
 * running the projector code it loaded before the update - so a feature the
 * manager tablet can now switch on never reaches the screen.
 *
 * The server stamps the page it serves with a fingerprint of its static files
 * (a `kids-galaxy-build` meta tag) and sends the current fingerprint on every
 * gallery response. The wall re-reads the gallery on every reconnect, so the
 * first gallery after an update shows a different build, and the page reloads
 * once to pick up the new code. Planets are restored from the gallery without a
 * celebration, as on any reload.
 *
 * A page without the meta tag (served by an older server) never reloads, and a
 * guard in sessionStorage stops a reload loop if the page somehow comes back
 * still announcing the old build.
 */

export const BUILD_HEADER = 'X-Kids-Galaxy-Build';
export const RELOAD_GUARD_KEY = 'kidsGalaxyBuildReload';
export const RELOAD_GUARD_MS = 5 * 60 * 1000;

/** The build the server stamped into this page, or null on an older server. */
export function pageBuildOf(doc) {
  const value = doc?.querySelector?.('meta[name="kids-galaxy-build"]')?.getAttribute?.('content');
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** sessionStorage if the browser allows it here, otherwise null. */
export function sessionStorageOrNull() {
  try {
    return typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage : null;
  } catch (_error) {
    return null;
  }
}

export class ProjectorBuildWatcher {
  constructor({ pageBuild, reload, storage = null, now = () => Date.now(), log = console }) {
    this.pageBuild = pageBuild || null;
    this.reload = reload;
    this.storage = storage;
    this.now = now;
    this.log = log;
    this.reloading = false;
    this.lastServerBuild = null;
  }

  /**
   * Note the build a server response announced. Returns true when the page is
   * about to reload, so the caller can skip the rest of its work.
   */
  observe(serverBuild) {
    if (typeof serverBuild === 'string' && serverBuild) this.lastServerBuild = serverBuild;
    if (this.reloading) return true;
    if (!this.pageBuild || !serverBuild || serverBuild === this.pageBuild) return false;

    const guard = this.readGuard();
    if (guard?.build === serverBuild && this.now() - guard.at < RELOAD_GUARD_MS) return false;

    this.writeGuard({ build: serverBuild, at: this.now() });
    this.reloading = true;
    this.log?.info?.(
      `Kids Galaxy projector updated (${this.pageBuild} -> ${serverBuild}); reloading the wall.`,
    );
    this.reload();
    return true;
  }

  readGuard() {
    try {
      const raw = this.storage?.getItem(RELOAD_GUARD_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_error) {
      return null;
    }
  }

  writeGuard(value) {
    try {
      this.storage?.setItem(RELOAD_GUARD_KEY, JSON.stringify(value));
    } catch (_error) {
      // Private mode or a full quota: the reload still happens, unguarded.
    }
  }
}
