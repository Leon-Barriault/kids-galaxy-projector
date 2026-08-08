package com.kidsgalaxy.domain

import com.kidsgalaxy.domain.model.PlanetGuide
import com.kidsgalaxy.domain.model.Point
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
    private val projection =
        SphericalProjection(
            outputWidth = 1024,
            outputHeight = 512,
            guide = guide,
        )

    @Test
    fun `top row maps to the disc centre (north pole)`() {
        // y = 0 → v ≈ 0 → r ≈ 0 → source = centre
        for (x in listOf(0, 512, 1023)) {
            val p = projection.sourcePoint(x, 0)
            assertEquals("x=$x", guide.centreX, p.x, 1f)
            assertEquals("x=$x", guide.centreY, p.y, 1f)
        }
    }

    @Test
    fun `bottom row maps to the rim (south pole)`() {
        // y = H-1 → v ≈ 1 → r ≈ 1 → distance from centre ≈ radius
        for (x in listOf(0, 256, 512, 768, 1023)) {
            val p = projection.sourcePoint(x, 511)
            val dist = hypot(p.x - guide.centreX, p.y - guide.centreY)
            assertEquals("x=$x rim distance", guide.radius, dist, 1f)
        }
    }

    @Test
    fun `r grows monotonically with y`() {
        var previous = -1f
        for (y in 0 until 512 step 16) {
            val p = projection.sourcePoint(0, y)
            val r = hypot(p.x - guide.centreX, p.y - guide.centreY)
            assertTrue("r must increase with y (y=$y, r=$r, prev=$previous)", r >= previous - tolerance)
            previous = r
        }
    }

    @Test
    fun `longitude wraps so u equals 0 and u equals 1 land on the same source point`() {
        // x=0 and the mathematical u=1 boundary share the same φ = 0 / 2π.
        // Pixel x=width-1 is just shy of u=1; compare angle via vectors from centre.
        val a = projection.sourcePoint(0, 256)
        val b = projection.sourcePoint(1023, 256)
        // Both should be near the equator ring (r ≈ 0.5).
        val ra = hypot(a.x - guide.centreX, a.y - guide.centreY)
        val rb = hypot(b.x - guide.centreX, b.y - guide.centreY)
        assertEquals(ra, rb, 1f)
        // Angular separation between first and last column should be nearly full circle
        // step — i.e. they are neighbours on the ring, distance small relative to radius.
        val chord = hypot(a.x - b.x, a.y - b.y)
        assertTrue("wrap neighbours should be close on the ring, chord=$chord", chord < guide.radius * 0.05f)
    }

    @Test
    fun `every returned point lies inside the disc`() {
        for (y in 0 until 512 step 32) {
            for (x in 0 until 1024 step 32) {
                val p = projection.sourcePoint(x, y)
                val dist = hypot(p.x - guide.centreX, p.y - guide.centreY)
                assertTrue(
                    "($x,$y) → $p is outside disc (dist=$dist)",
                    dist <= guide.radius + 1f,
                )
            }
        }
    }

    @Test
    fun `mid-row samples sit near half radius`() {
        val p = projection.sourcePoint(0, 255)
        val dist = hypot(p.x - guide.centreX, p.y - guide.centreY)
        assertEquals(guide.radius * 0.5f, dist, 2f)
    }

    @Test
    fun `degenerate guide still returns centre-ish points without throwing`() {
        val empty = PlanetGuide(0f, 0f, 0f)
        val proj = SphericalProjection(64, 32, empty)
        val p = proj.sourcePoint(10, 10)
        assertEquals(0f, p.x, tolerance)
        assertEquals(0f, p.y, tolerance)
        assertEquals(0f, abs(p.x) + abs(p.y), tolerance)
    }
}
