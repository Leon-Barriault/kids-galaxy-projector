#!/usr/bin/env python3
"""Focused WebGL contract for the reference-art renderer and Easter theme."""

from __future__ import annotations

from playwright.sync_api import sync_playwright

from check_projector import Server, chromium_executable, force_space_activity, kid_style_png_bytes, wait_for


FAILURES: list[str] = []


def check(condition: bool, description: str) -> None:
    print(f"  {'PASS' if condition else 'FAIL'}  {description}")
    if not condition:
        FAILURES.append(description)


def main() -> int:
    with Server() as server, sync_playwright() as pw:
        ringed = server.upload(
            "Reference Ring",
            artwork=kid_style_png_bytes(),
            style="ringed",
            ring_color="#68c9ef",
        )
        companion = server.upload(
            "Easter Friend",
            artwork=kid_style_png_bytes(),
            style="classic",
            companions="astronaut",
        )

        browser = pw.chromium.launch(
            executable_path=chromium_executable(),
            args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
        )
        page = browser.new_page(viewport={"width": 2560, "height": 1440})
        errors: list[str] = []
        page.on(
            "console",
            lambda message: errors.append(message.text) if message.type == "error" else None,
        )
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(f"{server.base}/", wait_until="load")
        wait_for(page, "window.kidsGalaxy && window.kidsGalaxy.kidPlanets.size === 2")
        wait_for(
            page,
            f"(() => {{ const p = window.kidsGalaxy.kidPlanets.get('{ringed}');"
            "return p?.accentMesh?.material?.userData?.kidsGalaxyRoundedMoldedTop; })()",
        )

        print("\nreference-style planet construction")
        surface = page.evaluate(
            f"(() => {{ const p = window.kidsGalaxy.kidPlanets.get('{ringed}');"
            "const body = p.mesh.material.userData; const edge = p.accentEdgeMesh.material.userData;"
            "const top = p.accentMesh.material.userData; return {"
            "referenceSurface: Boolean(body.kidsGalaxyReferenceSurface),"
            "sameHueShoulder: Boolean(edge.kidsGalaxySameHueShoulder),"
            "roundedTop: Boolean(top.kidsGalaxyRoundedMoldedTop),"
            "accentCoverage: body.accentCoverage, accentColorCount: body.accentColorCount,"
            "componentCount: body.componentCount,"
            "handmade: Boolean(p.mesh.geometry.userData.kidsGalaxyHandmadeSoftness),"
            "handmadeVariation: p.mesh.geometry.userData.handmadeVariation,"
            "edgeRoughness: p.accentEdgeMesh.material.roughness,"
            "topRoughness: p.accentMesh.material.roughness"
            "}; })()"
        )
        check(surface["referenceSurface"], "planet uses the reference-art surface pipeline")
        check(surface["sameHueShoulder"], "raised feature shoulder inherits the feature hue")
        check(surface["roundedTop"], "raised feature top uses rounded relief")
        check(surface["accentColorCount"] <= 2, "drawing is simplified to at most two accent colours")
        check(surface["componentCount"] <= 4, "drawing is consolidated to at most four large forms")
        check(0.10 <= surface["accentCoverage"] <= 0.36, "body remains dominant around sculpted accents")
        check(surface["handmade"], "sphere includes subtle molded handmade softness")
        check(surface["handmadeVariation"] < 0.012, "body softness remains subtle rather than lumpy")
        check(surface["topRoughness"] < surface["edgeRoughness"], "accent top catches a softer highlight than its sidewall")

        print("\nrealistic continuous ring gradation")
        ring = page.evaluate(
            f"(() => {{ const p = window.kidsGalaxy.kidPlanets.get('{ringed}');"
            "const ring = p.decorations[0]; const bands = ring.children.filter((o) => o.userData?.kidsGalaxyRingBand);"
            "const hairlines = ring.children.filter((o) => o.userData?.kidsGalaxyRingHairline);"
            "const samples = bands.map((o) => { const hsl = {}; o.material.color.getHSL(hsl);"
            "return { t: o.geometry.userData.bandPosition, l: hsl.l }; });"
            "const middle = samples.filter((s) => s.t > 0.38 && s.t < 0.62);"
            "const edges = samples.filter((s) => s.t < 0.16 || s.t > 0.84);"
            "const avg = (a) => a.reduce((sum, item) => sum + item.l, 0) / Math.max(a.length, 1);"
            "return { realistic: Boolean(ring.userData.kidsGalaxyRealisticGradientRing),"
            "geometryRealistic: Boolean(ring.geometry.userData.kidsGalaxyRealisticGradientRing),"
            "bands: bands.length, hairlines: hairlines.length,"
            "middleLightness: avg(middle), edgeLightness: avg(edges),"
            "thickness: ring.geometry.userData.thickness,"
            "wobble: ring.geometry.userData.wobbleAmplitude }; })()"
        )
        check(ring["realistic"] and ring["geometryRealistic"], "ring uses the graded continuous renderer")
        check(ring["bands"] >= 18, "ring contains dense concentric tonal strata")
        check(ring["hairlines"] >= 6, "ring contains fine dark radial divisions")
        check(ring["middleLightness"] > ring["edgeLightness"] + 0.08, "ring is visibly lighter through the middle and darker at both edges")
        check(ring["thickness"] >= 0.13, "ring keeps a substantial rounded edge thickness")
        check(ring["wobble"] <= 0.03, "organic outline variation remains subtle")

        print("\neaster substitutions controlled by manager behavior")
        server.update_behavior(
            mode="manual",
            manual_theme="easter",
            enabled_themes=["halloween", "easter", "christmas"],
            asteroid_belt_enabled=True,
            flyby_asteroids_enabled=True,
            flyby_frequency="frequent",
        )
        wait_for(page, "window.kidsGalaxy.engine.behaviorController.current?.theme === 'easter'")
        wait_for(page, "window.kidsGalaxy.engine.environment.asteroidBelt?.userData?.kidsGalaxyAsteroidStyle === 'easter-egg'")
        wait_for(
            page,
            f"(() => {{ const p = window.kidsGalaxy.kidPlanets.get('{companion}');"
            "return Boolean(p?.companions.find((r) => r.type === 'astronaut')?.object?.userData?.kidsGalaxyWhiteBunny); })()",
        )
        force_space_activity(page)
        easter = page.evaluate(
            f"(() => {{ const env = window.kidsGalaxy.engine.environment;"
            f"const p = window.kidsGalaxy.kidPlanets.get('{companion}');"
            "const bodies = env.asteroidBelt?.children.find((o) => o.userData?.kidsGalaxyThemedAsteroids);"
            "const astronaut = p.companions.find((r) => r.type === 'astronaut');"
            "const colours = []; if (bodies?.instanceColor) {"
            "for (let i = 0; i < Math.min(8, bodies.count); i += 1) {"
            "const c = bodies.material.color.clone(); bodies.getColorAt(i, c); colours.push(c.getHexString()); }}"
            "return { beltStyle: env.asteroidBelt?.userData?.kidsGalaxyAsteroidStyle,"
            "eggGeometry: Boolean(bodies?.geometry?.userData?.kidsGalaxyEasterEgg),"
            "pattern: Boolean(bodies?.geometry?.userData?.kidsGalaxyEasterEggPattern),"
            "pastel: Boolean(bodies?.userData?.kidsGalaxyPastelEggs),"
            "distinctColours: new Set(colours).size,"
            "flybyStyle: env.flybys[0]?.group?.userData?.kidsGalaxyAsteroidStyle,"
            "bunny: Boolean(astronaut?.object?.userData?.kidsGalaxyWhiteBunny) }; })()"
        )
        check(easter["beltStyle"] == "easter-egg", "Easter asteroid belt becomes Easter eggs")
        check(easter["eggGeometry"] and easter["pattern"], "Easter activity uses egg-shaped decorated geometry")
        check(easter["pastel"] and easter["distinctColours"] >= 3, "Easter eggs use multiple pastel colours")
        check(easter["flybyStyle"] == "easter-egg", "Easter fly-by asteroids become Easter eggs")
        check(easter["bunny"], "astronaut companion becomes a white bunny")

        server.update_behavior(
            mode="manual",
            manual_theme="default",
            asteroid_belt_enabled=True,
            flyby_asteroids_enabled=False,
        )
        wait_for(page, "window.kidsGalaxy.engine.behaviorController.current?.theme === 'default'")
        wait_for(
            page,
            f"(() => {{ const p = window.kidsGalaxy.kidPlanets.get('{companion}');"
            "return !p?.companions.find((r) => r.type === 'astronaut')?.object?.userData?.kidsGalaxyWhiteBunny; })()",
        )
        restored = page.evaluate(
            f"(() => {{ const env = window.kidsGalaxy.engine.environment;"
            f"const p = window.kidsGalaxy.kidPlanets.get('{companion}');"
            "const astronaut = p.companions.find((r) => r.type === 'astronaut');"
            "return { belt: env.asteroidBelt?.userData?.kidsGalaxyAsteroidStyle,"
            "bunny: Boolean(astronaut?.object?.userData?.kidsGalaxyWhiteBunny) }; })()"
        )
        check(restored["belt"] == "rock", "leaving Easter restores the normal asteroid belt")
        check(not restored["bunny"], "leaving Easter restores the astronaut companion")
        check(errors == [], f"no browser console errors ({errors[:3]})")

        browser.close()

    print()
    if FAILURES:
        print(f"{len(FAILURES)} check(s) failed:")
        for failure in FAILURES:
            print(f"  - {failure}")
        return 1
    print("reference renderer smoke test passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
