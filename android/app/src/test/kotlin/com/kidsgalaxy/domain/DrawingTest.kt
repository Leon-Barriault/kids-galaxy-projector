package com.kidsgalaxy.domain

import com.kidsgalaxy.domain.model.CanvasSize
import com.kidsgalaxy.domain.model.Drawing
import com.kidsgalaxy.domain.model.Point
import com.kidsgalaxy.domain.model.StrokePath
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Drawing aggregate holds stroke history and the undo/clear rules.
 * Pure Kotlin - no Compose, no Android, so it is trivially testable.
 */
class DrawingTest {

    private val red = 0xFFE53935.toInt()

    private fun stroke(vararg coords: Pair<Float, Float>) =
        StrokePath(
            points = coords.map { Point(it.first, it.second) },
            colorArgb = red,
            strokeWidth = 28f,
        )

    @Test
    fun `starts empty`() {
        val drawing = Drawing()
        assertTrue(drawing.isEmpty)
        assertEquals(0, drawing.strokes.size)
    }

    @Test
    fun `adding a stroke records it`() {
        val drawing = Drawing().addStroke(stroke(0f to 0f, 10f to 10f))
        assertFalse(drawing.isEmpty)
        assertEquals(1, drawing.strokes.size)
    }

    @Test
    fun `single-point strokes are ignored`() {
        // A tap is not a stroke; storing it would render nothing but cost memory.
        val drawing = Drawing().addStroke(stroke(5f to 5f))
        assertTrue(drawing.isEmpty)
    }

    @Test
    fun `empty strokes are ignored`() {
        assertTrue(Drawing().addStroke(stroke()).isEmpty)
    }

    @Test
    fun `undo removes only the most recent stroke`() {
        val drawing =
            Drawing()
                .addStroke(stroke(0f to 0f, 1f to 1f))
                .addStroke(stroke(2f to 2f, 3f to 3f))
                .undo()

        assertEquals(1, drawing.strokes.size)
        assertEquals(0f, drawing.strokes.first().points.first().x, 0.001f)
    }

    @Test
    fun `undo on an empty drawing is a no-op`() {
        assertTrue(Drawing().undo().isEmpty)
    }

    @Test
    fun `clear removes everything`() {
        val drawing =
            Drawing()
                .addStroke(stroke(0f to 0f, 1f to 1f))
                .addStroke(stroke(2f to 2f, 3f to 3f))
                .clear()
        assertTrue(drawing.isEmpty)
    }

    @Test
    fun `drawing is immutable - operations return new instances`() {
        val original = Drawing().addStroke(stroke(0f to 0f, 1f to 1f))
        val modified = original.addStroke(stroke(2f to 2f, 3f to 3f))

        assertEquals(1, original.strokes.size)
        assertEquals(2, modified.strokes.size)
    }

    @Test
    fun `canvas size starts unmeasured`() {
        assertFalse(Drawing().canvasSize.isMeasured)
    }

    @Test
    fun `canvas size can be recorded`() {
        val drawing = Drawing().withCanvasSize(CanvasSize(600f, 1000f))
        assertTrue(drawing.canvasSize.isMeasured)
        assertEquals(600f, drawing.canvasSize.width, 0.001f)
        assertEquals(1000f, drawing.canvasSize.height, 0.001f)
    }

    @Test
    fun `clear keeps the measured canvas size`() {
        // Re-measuring after every clear would be wasteful and briefly wrong.
        val drawing =
            Drawing()
                .withCanvasSize(CanvasSize(600f, 1000f))
                .addStroke(stroke(0f to 0f, 1f to 1f))
                .clear()

        assertTrue(drawing.isEmpty)
        assertEquals(600f, drawing.canvasSize.width, 0.001f)
    }
}
