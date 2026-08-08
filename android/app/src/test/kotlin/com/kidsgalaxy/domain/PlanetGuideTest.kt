package com.kidsgalaxy.domain

import com.kidsgalaxy.domain.model.CanvasSize
import com.kidsgalaxy.domain.model.PlanetGuide
import com.kidsgalaxy.domain.model.Point
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.min

/**
 * TDD suite for [PlanetGuide] — pure domain, runs on the JVM unit-test task.
 */
class PlanetGuideTest {
    private val tolerance = 1e-4f

    @Test
    fun `forCanvas centres the guide on any aspect ratio`() {
        val portrait = PlanetGuide.forCanvas(CanvasSize(600f, 1000f))
        assertEquals(300f, portrait.centreX, tolerance)
        assertEquals(500f, portrait.centreY, tolerance)

        val landscape = PlanetGuide.forCanvas(CanvasSize(1200f, 800f))
        assertEquals(600f, landscape.centreX, tolerance)
        assertEquals(400f, landscape.centreY, tolerance)
    }

    @Test
    fun `radius scales with the smaller dimension so the circle always fits`() {
        val size = CanvasSize(800f, 600f)
        val guide = PlanetGuide.forCanvas(size)
        val expected = PlanetGuide.RADIUS_FRACTION * min(size.width, size.height)
        assertEquals(expected, guide.radius, tolerance)
        // Rim stays inside the canvas with margin.
        assertTrue(guide.centreX - guide.radius > 0f)
        assertTrue(guide.centreY - guide.radius > 0f)
        assertTrue(guide.centreX + guide.radius < size.width)
        assertTrue(guide.centreY + guide.radius < size.height)
    }

    @Test
    fun `contains is true at the centre and on the rim`() {
        val guide = PlanetGuide(centreX = 100f, centreY = 100f, radius = 50f)
        assertTrue(guide.contains(Point(100f, 100f)))
        assertTrue(guide.contains(Point(150f, 100f))) // east rim
        assertTrue(guide.contains(Point(100f, 150f))) // south rim
    }

    @Test
    fun `contains is false outside the rim`() {
        val guide = PlanetGuide(centreX = 100f, centreY = 100f, radius = 50f)
        assertFalse(guide.contains(Point(151f, 100f)))
        assertFalse(guide.contains(Point(100f, 0f)))
        assertFalse(guide.contains(Point(0f, 0f)))
    }

    @Test
    fun `unmeasured canvas yields a degenerate guide instead of crashing`() {
        val guide = PlanetGuide.forCanvas(CanvasSize.Unmeasured)
        assertEquals(0f, guide.radius, tolerance)
        assertFalse(guide.isValid)
        assertFalse(guide.contains(Point(0f, 0f)))
    }

    @Test
    fun `square canvas uses half-side times fraction for radius`() {
        val guide = PlanetGuide.forCanvas(CanvasSize(1000f, 1000f))
        assertEquals(PlanetGuide.RADIUS_FRACTION * 1000f, guide.radius, tolerance)
    }
}
