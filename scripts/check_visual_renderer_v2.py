#!/usr/bin/env python3
"""Run the visual contract with reference-like neutral comparison lighting."""

from __future__ import annotations

import check_visual_renderer as visual


def isolate_planet(page, planet_id: str, include_ring: bool) -> None:
    page.evaluate(
        """
        ([id, includeRing]) => {
          const kg = window.kidsGalaxy;
          const p = kg.kidPlanets.get(id);
          const g = kg.engine.galaxyScene;
          const cameraController = kg.engine.cameraController;
          if (!p) return false;

          kg.scene.background.setHex(0xf6f5f2);
          kg.scene.fog = null;
          kg.renderer.toneMappingExposure = 0.95;
          g.stars.visible = false;
          g.companions.forEach((record) => { record.mesh.visible = false; });
          g.sunGroup.visible = true;
          g.sunGroup.children.forEach((child) => {
            if (child.isMesh) child.visible = false;
          });

          // Soft studio-style lighting comparable to the supplied toy/clay
          // references. Keep enough contrast to see the raised sidewalls while
          // avoiding the previous blown-out white highlights.
          g.sunLight.visible = true;
          g.sunLight.position.set(3.5, 4.2, 5.8);
          g.sunLight.intensity = 2.2;
          g.sunLight.decay = 0;
          g.ambientLight.visible = true;
          g.ambientLight.color.setHex(0xffffff);
          g.ambientLight.intensity = 0.34;
          g.fillLight.visible = true;
          g.fillLight.color.setHex(0xdce8ff);
          g.fillLight.intensity = 0.2;

          kg.kidPlanets.forEach((entity) => {
            entity.mesh.visible = entity === p;
            entity.ring.visible = false;
            entity.decorations.forEach((decoration) => {
              decoration.visible = entity === p && includeRing;
            });
            entity.companions.forEach((record) => { record.object.visible = false; });
          });

          p.mesh.position.set(0, 0, 0);
          p.mesh.scale.setScalar(includeRing ? 1.0 : 1.34);
          p.mesh.rotation.set(0.04, -0.08, 0.02);
          p.decorations.forEach((decoration) => decoration.position.set(0, 0, 0));
          p.update = () => {
            p.mesh.position.set(0, 0, 0);
            p.decorations.forEach((decoration) => decoration.position.set(0, 0, 0));
          };

          cameraController.controls.autoRotate = false;
          cameraController.controls.enabled = false;
          cameraController.camera.position.set(0, 0.18, includeRing ? 5.5 : 4.65);
          cameraController.camera.lookAt(0, 0, 0);
          cameraController.camera.updateProjectionMatrix();
          return true;
        }
        """,
        [planet_id, include_ring],
    )
    page.wait_for_timeout(650)


visual.isolate_planet = isolate_planet
raise SystemExit(visual.main())
