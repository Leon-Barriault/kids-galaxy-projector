#!/usr/bin/env python3
"""Real-browser acceptance checks for seasonal galaxy themes."""

from __future__ import annotations

from playwright.sync_api import sync_playwright

from check_projector import Server, check, chromium_executable, wait_for


THEMES = {
    "halloween": {"rock", "pumpkin", "jack-o-lantern"},
    "easter": {"rock", "easter-egg", "golden-egg"},
    "christmas": {"rock", "snowball", "ornament"},
    "remembrance-day": {"rock"},
    "canada-day": {"rock", "red-rock", "white-rock", "maple-leaf"},
    "fete-nationale": {"rock", "blue-rock", "white-rock", "fleur-de-lis"},
    "thanksgiving": {"rock", "autumn-rock", "pumpkin", "maple-leaf"},
    "new-year": {"rock", "gold-orb", "silver-orb"},
    "family-day": {"rock", "snowball", "heart"},
}


def fnv1a(text: str) -> int:
    value = 2166136261
    for character in text:
        value ^= ord(character)
        value = (value * 16777619) & 0xFFFFFFFF
    return value


def upload_bunny_candidate(server: Server) -> str:
    """Create a spiky astronaut planet whose deterministic Easter slot is a bunny."""
    for index in range(8):
        planet_id = server.upload(
            f"Seasonal-{index}",
            style="spiky",
            mountain_color="#d98242",
            companions="astronaut",
        )
        if fnv1a(f"{planet_id}-easter-bunny-0") % 2 == 0:
            return planet_id
    raise RuntimeError("could not create a deterministic Easter bunny fixture")


def theme_state(page, planet_id: str) -> dict:
    return page.evaluate(
        """
        (id) => {
          const kg = window.kidsGalaxy;
          const controller = kg.engine.behaviorController;
          const environment = kg.engine.environment;
          const planet = kg.kidPlanets.get(id);
          const styles = [];
          environment.asteroidBelt?.traverse((object) => {
            if (object.userData?.kidsGalaxyThemedAsteroids) {
              styles.push(object.userData.kidsGalaxyAsteroidStyle);
            }
          });
          const astronaut = planet?.companions.find((record) => record.type === 'astronaut');
          return {
            activeTheme: controller.current?.theme || '',
            beltTheme: environment.asteroidBelt?.userData?.kidsGalaxyTheme || '',
            styles: [...new Set(styles)].sort(),
            particleTheme: kg.engine.galaxyScene.seasonalParticles?.userData?.kidsGalaxySeasonalTheme || '',
            celebrationTheme: kg.engine.celebration.theme,
            arrivalCelebrate: kg.engine.celebration.arrivalEffect().celebrate,
            terrainCount: planet?._themeTerrainFeatures?.length || 0,
            holidayDecorationCount: planet?._themeHolidayDecorations?.length || 0,
            christmasClusters:
              planet?._themeHolidayDecorations?.filter(
                (object) => object.userData?.kidsGalaxyChristmasTreeCluster,
              ).length || 0,
            bunny: Boolean(astronaut?.object?.userData?.kidsGalaxyWhiteBunny),
            witch: Boolean(astronaut?.object?.userData?.kidsGalaxyWitchOnBroom),
          };
        }
        """,
        planet_id,
    )


def main() -> int:
    with Server() as server:
        planet_id = upload_bunny_candidate(server)
        server.update_behavior(
            mode="manual",
            manual_theme="default",
            asteroid_belt_enabled=True,
            ambient_effects=True,
        )

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path=chromium_executable(),
                args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
            )
            page = browser.new_page(viewport={"width": 1280, "height": 720})
            # The projector keeps a live EventSource connection open by design,
            # so Playwright's network-idle state may never be reached. Wait for
            # DOM readiness and then for the actual projector composition state.
            page.goto(server.base, wait_until="domcontentloaded")
            page.wait_for_function(
                "() => Boolean(window.kidsGalaxy?.engine?.behaviorController?.current)",
                timeout=30_000,
            )
            page.wait_for_function(
                f"() => window.kidsGalaxy.kidPlanets.has('{planet_id}')",
                timeout=30_000,
            )

            baseline = theme_state(page, planet_id)
            check(baseline["terrainCount"] > 0, "spiky fixture starts with kid-authored mountain terrain")
            baseline_terrain = baseline["terrainCount"]

            for theme, expected_styles in THEMES.items():
                server.update_behavior(mode="manual", manual_theme=theme)
                wait_for(
                    page,
                    f"() => window.kidsGalaxy.engine.behaviorController.current?.theme === '{theme}'",
                )
                wait_for(
                    page,
                    f"() => window.kidsGalaxy.engine.environment.asteroidBelt?.userData?.kidsGalaxyTheme === '{theme}'",
                )
                page.wait_for_timeout(180)
                state = theme_state(page, planet_id)

                check(state["activeTheme"] == theme, f"{theme}: behavior controller applies theme")
                check(state["beltTheme"] == theme, f"{theme}: asteroid belt rebuilds for theme")
                check(
                    set(state["styles"]) == expected_styles,
                    f"{theme}: mixed space objects are {sorted(expected_styles)}",
                )
                check(
                    state["particleTheme"] == theme,
                    f"{theme}: registry ambient particles are active",
                )
                check(
                    state["celebrationTheme"] == theme,
                    f"{theme}: arrival effect follows active theme",
                )

                if theme == "remembrance-day":
                    check(
                        state["arrivalCelebrate"] is False,
                        "Remembrance Day suppresses festive arrival bursts",
                    )
                else:
                    check(
                        state["arrivalCelebrate"] is True,
                        f"{theme}: arrival remains celebratory",
                    )

                if theme == "christmas":
                    check(
                        state["terrainCount"] == baseline_terrain,
                        "Christmas preserves the child's mountain terrain",
                    )
                    check(
                        state["christmasClusters"] > 0,
                        "Christmas adds tree clusters as separate decorations",
                    )

                if theme == "easter":
                    wait_for(
                        page,
                        f"() => window.kidsGalaxy.kidPlanets.get('{planet_id}')?.companions"
                        ".find((record) => record.type === 'astronaut')?.object?.userData"
                        "?.kidsGalaxyWhiteBunny === true",
                    )
                    state = theme_state(page, planet_id)
                    check(state["bunny"] is True, "Easter activates the existing white bunny companion")

                if theme == "halloween":
                    check(state["witch"] is True, "Halloween still replaces astronaut with witch")

            server.update_behavior(mode="manual", manual_theme="default")
            wait_for(
                page,
                "() => window.kidsGalaxy.engine.behaviorController.current?.theme === 'default'",
            )
            page.wait_for_timeout(150)
            restored = theme_state(page, planet_id)
            check(
                restored["terrainCount"] == baseline_terrain,
                "leaving seasonal themes keeps original mountain terrain intact",
            )
            check(
                restored["holidayDecorationCount"] == 0,
                "holiday decorations are removed when returning to default",
            )
            check(restored["bunny"] is False, "Easter bunny returns to the normal astronaut")
            check(restored["witch"] is False, "Halloween witch returns to the normal astronaut")

            browser.close()

    return 1 if __import__("check_projector").FAILURES else 0


if __name__ == "__main__":
    raise SystemExit(main())
