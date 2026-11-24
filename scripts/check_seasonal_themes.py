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
    """Create a spiky planet whose deterministic Easter slot is a bunny.

    The astronaut stays first so the Easter seed is index 0. The satellite is
    the Christmas gift fixture.
    """
    for index in range(8):
        planet_id = server.upload(
            f"Seasonal-{index}",
            style="spiky",
            mountain_color="#d98242",
            companions="astronaut,satellite",
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
          const satellite = planet?.companions.find((record) => record.type === 'satellite');
          const red = (color) => color.r > 0.55 && color.g < 0.28 && color.b < 0.32 && color.r > color.g * 2;
          const white = (color) => color.r > 0.82 && color.g > 0.82 && color.b > 0.78;
          const roleMatches = (object, key, role, predicate) => {
            let found = false;
            let ok = true;
            object?.traverse((child) => {
              if (child.userData?.[key] !== role || !child.material?.color) return;
              found = true;
              ok = ok && predicate(child.material.color);
            });
            return found && ok;
          };
          const hasPartGeometry = (object, role, type) => {
            let found = false;
            object?.traverse((child) => {
              if (child.userData?.kidsGalaxyGiftPart === role && child.geometry?.type === type) {
                found = true;
              }
            });
            return found;
          };
          let leftPanel = false;
          let rightPanel = false;
          satellite?.object?.traverse((child) => {
            if (child.userData?.kidsGalaxyGiftPart !== 'panel') return;
            if (child.position.x < -0.1) leftPanel = true;
            if (child.position.x > 0.1) rightPanel = true;
          });
          let ornamentCapMeshes = 0;
          let ornamentCapCasts = false;
          let ornamentHook = false;
          let ornamentHighlightMeshes = 0;
          let ornamentHighlightCasts = false;
          let ornamentRoughness = null;
          let ornamentTransmission = null;
          let ornamentClearcoat = null;
          let ornamentUpright = 0;
          let ornamentSamples = 0;
          environment.asteroidBelt?.traverse((object) => {
            if (object.userData?.kidsGalaxyOrnamentCaps) {
              ornamentCapMeshes += 1;
              ornamentCapCasts = object.castShadow === true;
              ornamentHook = Boolean(object.geometry?.userData?.kidsGalaxyOrnamentHook);
            }
            if (object.userData?.kidsGalaxyOrnamentHighlights) {
              ornamentHighlightMeshes += 1;
              ornamentHighlightCasts = object.castShadow === true;
            }
            if (
              object.userData?.kidsGalaxyThemedAsteroids
              && object.userData?.kidsGalaxyAsteroidStyle === 'ornament'
            ) {
              ornamentRoughness = object.material?.roughness ?? null;
              ornamentTransmission = object.material?.transmission ?? 0;
              ornamentClearcoat = object.material?.clearcoat ?? 0;
              const scratch = object.matrix.clone();
              const sample = Math.min(object.count, 6);
              for (let index = 0; index < sample; index += 1) {
                object.getMatrixAt(index, scratch);
                ornamentSamples += 1;
                const yAxisX = scratch.elements[4];
                const yAxisY = scratch.elements[5];
                const yAxisZ = scratch.elements[6];
                if (Math.abs(yAxisX) < 1e-3 && Math.abs(yAxisZ) < 1e-3 && yAxisY > 0) {
                  ornamentUpright += 1;
                }
              }
            }
          });
          const santa = astronaut?.object;
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
            bunny: Boolean(santa?.userData?.kidsGalaxyWhiteBunny),
            witch: Boolean(santa?.userData?.kidsGalaxyWitchOnBroom),
            santa: Boolean(santa?.userData?.kidsGalaxySanta),
            santaSuit: roleMatches(santa, 'kidsGalaxySantaPart', 'suit', red),
            santaFur: roleMatches(santa, 'kidsGalaxySantaPart', 'fur', white),
            santaBeard: roleMatches(santa, 'kidsGalaxySantaPart', 'beard', white),
            santaHat: roleMatches(santa, 'kidsGalaxySantaPart', 'hat', red),
            santaTrim: roleMatches(santa, 'kidsGalaxySantaPart', 'trim', white),
            santaPompom: roleMatches(santa, 'kidsGalaxySantaPart', 'pompom', white),
            gift: Boolean(satellite?.object?.userData?.kidsGalaxyGiftSatellite),
            giftWrap: hasPartGeometry(satellite?.object, 'wrap', 'BoxGeometry'),
            giftRibbon: hasPartGeometry(satellite?.object, 'ribbon', 'BoxGeometry'),
            giftBow: hasPartGeometry(satellite?.object, 'bow', 'TorusGeometry'),
            giftPanels: leftPanel && rightPanel,
            ornamentCapMeshes,
            ornamentCapCasts,
            ornamentHook,
            ornamentHighlightMeshes,
            ornamentHighlightCasts,
            ornamentRoughness,
            ornamentTransmission,
            ornamentClearcoat,
            ornamentUpright,
            ornamentSamples,
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
                    wait_for(
                        page,
                        f"() => window.kidsGalaxy.kidPlanets.get('{planet_id}')?.companions"
                        ".find((record) => record.type === 'astronaut')?.object?.userData"
                        "?.kidsGalaxySanta === true",
                    )
                    wait_for(
                        page,
                        f"() => window.kidsGalaxy.kidPlanets.get('{planet_id}')?.companions"
                        ".find((record) => record.type === 'satellite')?.object?.userData"
                        "?.kidsGalaxyGiftSatellite === true",
                    )
                    state = theme_state(page, planet_id)
                    check(
                        state["terrainCount"] == baseline_terrain,
                        "Christmas preserves the child's mountain terrain",
                    )
                    check(
                        state["christmasClusters"] > 0,
                        "Christmas adds tree clusters as separate decorations",
                    )
                    check(state["santaSuit"] is True, "Christmas astronaut wears a red suit")
                    check(state["santaFur"] is True, "Christmas suit has white fur trim")
                    check(state["santaBeard"] is True, "Christmas astronaut has a white beard")
                    check(state["santaHat"] is True, "Christmas astronaut wears a red tuque")
                    check(state["santaTrim"] is True, "Christmas tuque has white trim")
                    check(state["santaPompom"] is True, "Christmas tuque has a white pompom")
                    check(state["giftWrap"] is True, "Christmas satellite carries a wrapped gift")
                    check(state["giftRibbon"] is True, "Christmas gift is tied with a ribbon")
                    check(state["giftBow"] is True, "Christmas gift has a bow")
                    check(state["giftPanels"] is True, "Christmas gift stays between the satellite panels")
                    check(
                        state["ornamentCapMeshes"] == 1 and state["ornamentCapCasts"] is True,
                        "ornament caps are one shadow-casting instanced mesh",
                    )
                    check(state["ornamentHook"] is True, "ornament caps include a top hook")
                    check(
                        state["ornamentHighlightMeshes"] == 1
                        and state["ornamentHighlightCasts"] is False,
                        "ornament highlights are one instanced mesh and do not cast shadows",
                    )
                    check(
                        state["ornamentRoughness"] is not None and state["ornamentRoughness"] < 0.15,
                        "ornaments are glossy glass",
                    )
                    check(
                        state["ornamentClearcoat"] is not None and state["ornamentClearcoat"] >= 0.8,
                        "ornaments keep a glass clearcoat",
                    )
                    check(
                        state["ornamentTransmission"] == 0,
                        "ornaments do not enable refractive transmission",
                    )
                    check(
                        state["ornamentSamples"] > 0
                        and state["ornamentUpright"] == state["ornamentSamples"],
                        "ornaments hang upright so the hook stays on top",
                    )
                else:
                    check(state["santa"] is False, f"{theme}: astronaut is not dressed as Santa")
                    check(state["gift"] is False, f"{theme}: satellite is not a gift")
                    check(
                        state["ornamentCapMeshes"] == 0,
                        f"{theme}: no Christmas ornament caps",
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
            check(restored["santa"] is False, "Christmas Santa returns to the normal astronaut")
            check(restored["gift"] is False, "Christmas gift returns to the normal satellite")
            check(restored["ornamentCapMeshes"] == 0, "Christmas ornament caps leave with the theme")

            browser.close()

    return 1 if __import__("check_projector").FAILURES else 0


if __name__ == "__main__":
    raise SystemExit(main())
