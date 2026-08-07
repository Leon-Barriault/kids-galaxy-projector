package com.kidsgalaxy.domain

import com.kidsgalaxy.domain.model.Point
import com.kidsgalaxy.domain.model.StrokePath
import com.kidsgalaxy.domain.render.TextureProjection
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The projection maps tablet canvas coordinates onto the square planet texture.
 *
 * This is pure arithmetic with no Android dependency, which is exactly why it
 * lives in the domain: the previous implementation hard-coded a 800px canvas
 * and could only be validated by eye on a device.
 */
class TextureProjectionTest {

    private val textureSize = 1024

    @Test
    fun `square canvas maps corner to corner`() {
        val projection = TextureProjection(600f, 600f, textureSize)

        val topLeft = projection.map(Point(0f, 0f))
        assertEquals(0f, topLeft.x, TOLERANCE)
        assertEquals(0f, topLeft.y, TOLERANCE)

        val bottomRight = projection.map(Point(600f, 600f))
        assertEquals(1024f, bottomRight.x, TOLERANCE)
        assertEquals(1024f, bottomRight.y, TOLERANCE)
    }

    @Test
    fun `portrait canvas is letterboxed horizontally, not stretched`() {
        // Tall canvas: height drives the scale, width is centred with margins.
        val projection = TextureProjection(600f, 1000f, textureSize)

        assertEquals(1024f / 1000f, projection.scale, TOLERANCE)

        // Vertically it fills the texture edge to edge.
        assertEquals(0f, projection.map(Point(0f, 0f)).y, TOLERANCE)
        assertEquals(1024f, projection.map(Point(0f, 1000f)).y, TOLERANCE)

        // Horizontally it is inset symmetrically.
        val left = projection.map(Point(0f, 0f)).x
        val right = projection.map(Point(600f, 0f)).x
        assertTrue("expected a left margin", left > 0f)
        assertTrue("expected a right margin", right < 1024f)
        assertEquals(left, 1024f - right, TOLERANCE)
    }

    @Test
    fun `landscape canvas is letterboxed vertically`() {
        val projection = TextureProjection(1000f, 600f, textureSize)

        assertEquals(0f, projection.map(Point(0f, 0f)).x, TOLERANCE)
        assertEquals(1024f, projection.map(Point(1000f, 0f)).x, TOLERANCE)

        val top = projection.map(Point(0f, 0f)).y
        val bottom = projection.map(Point(0f, 600f)).y
        assertTrue(top > 0f)
        assertEquals(top, 1024f - bottom, TOLERANCE)
    }

    @Test
    fun `aspect ratio is preserved so a circle stays a circle`() {
        val projection = TextureProjection(600f, 1000f, textureSize)

        // A square drawn on the canvas must remain square on the texture.
        val a = projection.map(Point(100f, 100f))
        val b = projection.map(Point(300f, 100f))
        val c = projection.map(Point(100f, 300f))

        val horizontal = b.x - a.x
        val vertical = c.y - a.y
        assertEquals(horizontal, vertical, TOLERANCE)
    }

    @Test
    fun `centre of the canvas maps to centre of the texture`() {
        val projection = TextureProjection(600f, 1000f, textureSize)
        val centre = projection.map(Point(300f, 500f))
        assertEquals(512f, centre.x, TOLERANCE)
        assertEquals(512f, centre.y, TOLERANCE)
    }

    @Test
    fun `stroke width scales with the projection`() {
        val projection = TextureProjection(512f, 512f, textureSize)
        // Canvas is half the texture size, so a 28px brush becomes 56px.
        assertEquals(56f, projection.scaleStrokeWidth(28f), TOLERANCE)
    }

    @Test
    fun `unmeasured canvas falls back to a square identity mapping`() {
        // Guards against a divide-by-zero if a send happens before layout.
        val projection = TextureProjection(0f, 0f, textureSize)
        assertEquals(1f, projection.scale, TOLERANCE)
        val point = projection.map(Point(10f, 20f))
        assertEquals(10f, point.x, TOLERANCE)
        assertEquals(20f, point.y, TOLERANCE)
    }

    @Test
    fun `projected strokes keep their colour and point count`() {
        val projection = TextureProjection(600f, 600f, textureSize)
        val stroke =
            StrokePath(
                points = listOf(Point(0f, 0f), Point(300f, 300f), Point(600f, 600f)),
                colorArgb = 0xFFE53935.toInt(),
                strokeWidth = 28f,
            )

        val projected = projection.project(stroke)

        assertEquals(3, projected.points.size)
        assertEquals(0xFFE53935.toInt(), projected.colorArgb)
        assertEquals(512f, projected.points[1].x, TOLERANCE)
    }

    private companion object {
        const val TOLERANCE = 0.01f
    }
}
