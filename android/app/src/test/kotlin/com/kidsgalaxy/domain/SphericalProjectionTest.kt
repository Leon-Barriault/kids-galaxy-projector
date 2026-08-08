package com.kidsgalaxy.domain

import com.kidsgalaxy.domain.model.PlanetGuide
import com.kidsgalaxy.domain.render.SphericalProjection
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs
import kotlin.math.hypot

/**
 * TDD suite for polar (globe-style) [SphericalProjection].
 *
 * Property-style checks preferred over brittle fixed constants — the mapping
 * must keep the disc centre at the north pole and the rim at the south pole.
 */
class SphericalProjectionTest {
    private val tolerance = 1e-3f
    private val guide = PlanetGuide(centreX = 200f, centreY = 200f, radius = 100f)

    private fun projection(
        w: Int = 512,
        h: Int = 256,
    ) = SphericalProjection(w, h, guide)

    @Test
    fun northPoleMapsToDiscCentre() {
        // Half-pixel centre of the first row sits slightly off the true pole
        // (v = 0.5 / H). That is intentional for dense sampling; the sample
        // must still land very near the disc centre.
        val p = projection().sourcePoint(256, 0)
        val r = hypot(p.x - guide.centreX, p.y - guide.centreY)
        assertTrue("north sample too far from centre: r=$r", r < 1f)
    }

    @Test
    fun southPoleMapsToRim() {
        val p = projection().sourcePoint(256, 255)
        val r = hypot(p.x - guide.centreX, p.y - guide.centreY)
        assertEquals(guide.radius, r, 1f)
    }

    @Test
    fun radialDistanceMonotonicWithY() {
        val proj = projection()
        var prev = 0f
        for (y in 0 until 256) {
            val p = proj.sourcePoint(0, y)
            val r = hypot(p.x - guide.centreX, p.y - guide.centreY)
            assertTrue("r should not decrease at y=$y", r + tolerance >= prev)
            prev = r
        }
    }

    @Test
    fun longitudeWraps() {
        val proj = projection()
        // Full-width samples (x=0 and x=W-1) land on nearly the same longitude
        // because of the 2π wrap; opposite sides are half a turn apart.
        val a = proj.sourcePoint(0, 128)
        val b = proj.sourcePoint(256, 128)
        assertTrue(
            "opposite longitudes should be far apart on the disc",
            abs(a.x - b.x) > 50f || abs(a.y - b.y) > 50f,
        )
    }

    @Test
    fun allSamplesStayInsideDisc() {
        val proj = projection()
        for (x in 0 until 64) {
            for (y in 0 until 32) {
                val p = proj.sourcePoint(x * 8, y * 8)
                val r = hypot(p.x - guide.centreX, p.y - guide.centreY)
                assertTrue("sample outside disc at ($x,$y)", r <= guide.radius + 1f)
            }
        }
    }
}
