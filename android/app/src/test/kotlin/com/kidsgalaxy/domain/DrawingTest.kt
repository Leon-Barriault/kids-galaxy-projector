package com.kidsgalaxy.domain

import com.kidsgalaxy.domain.model.CanvasSize
import com.kidsgalaxy.domain.model.Drawing
import com.kidsgalaxy.domain.model.Point
import com.kidsgalaxy.domain.model.StrokePath
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DrawingTest {
    private val red = 0xFFE53935.toInt()
    private val blue = 0xFF2196F3.toInt()

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
        assertEquals(0xFFFFFFFF.toInt(), drawing.backgroundColorArgb)
    }

    @Test
    fun `adding a stroke records it`() {
        val drawing = Drawing().addStroke(stroke(0f to 0f, 10f to 10f))
        assertFalse(drawing.isEmpty)
        assertEquals(1, drawing.strokes.size)
    }

    @Test
    fun `single-point strokes are ignored`() {
        assertTrue(Drawing().addStroke(stroke(5f to 5f)).isEmpty)
    }

    @Test
    fun `empty strokes are ignored`() {
        assertTrue(Drawing().addStroke(stroke()).isEmpty)
    }

    @Test
    fun `bucket fill changes only background and preserves authored strokes`() {
        val originalStroke = stroke(10f to 20f, 90f to 80f)
        val drawing =
            Drawing()
                .withCanvasSize(CanvasSize(100f, 100f))
                .addStroke(originalStroke)
                .fillBackground(blue)

        assertEquals(blue, drawing.backgroundColorArgb)
        assertTrue(drawing.hasExplicitBackgroundFill)
        assertFalse(drawing.isEmpty)
        assertEquals(2, drawing.strokes.size)
        assertTrue(drawing.strokes.first().isBackgroundFill)
        assertEquals(originalStroke, drawing.strokes.last())
    }

    @Test
    fun `bucket-only planet is launchable drawing and white is a valid explicit body`() {
        val drawing =
            Drawing()
                .withCanvasSize(CanvasSize(200f, 160f))
                .fillBackground(0xFFFFFFFF.toInt())

        assertFalse(drawing.isEmpty)
        assertEquals(0xFFFFFFFF.toInt(), drawing.backgroundColorArgb)
        assertTrue(drawing.strokes.single().isBackgroundFill)
    }

    @Test
    fun `changing bucket color replaces fill underneath existing strokes`() {
        val authored = stroke(20f to 20f, 80f to 80f)
        val drawing =
            Drawing()
                .withCanvasSize(CanvasSize(100f, 100f))
                .addStroke(authored)
                .fillBackground(red)
                .fillBackground(blue)

        assertEquals(2, drawing.strokes.size)
        assertEquals(blue, drawing.strokes.first().colorArgb)
        assertTrue(drawing.strokes.first().isBackgroundFill)
        assertEquals(authored, drawing.strokes.last())
    }

    @Test
    fun `undo removes authored stroke before removing bucket fill`() {
        val filled =
            Drawing()
                .withCanvasSize(CanvasSize(100f, 100f))
                .fillBackground(blue)
                .addStroke(stroke(0f to 0f, 10f to 10f))

        val afterStrokeUndo = filled.undo()
        assertFalse(afterStrokeUndo.isEmpty)
        assertTrue(afterStrokeUndo.hasExplicitBackgroundFill)
        assertTrue(afterStrokeUndo.strokes.single().isBackgroundFill)

        val afterFillUndo = afterStrokeUndo.undo()
        assertTrue(afterFillUndo.isEmpty)
        assertFalse(afterFillUndo.hasExplicitBackgroundFill)
        assertEquals(0xFFFFFFFF.toInt(), afterFillUndo.backgroundColorArgb)
    }

    @Test
    fun `undo removes only the most recent stroke`() {
        val drawing =
            Drawing()
                .addStroke(stroke(0f to 0f, 1f to 1f))
                .addStroke(stroke(2f to 2f, 3f to 3f))
                .undo()

        assertEquals(1, drawing.strokes.size)
        assertEquals(
            0f,
            drawing.strokes
                .first()
                .points
                .first()
                .x,
            0.001f,
        )
    }

    @Test
    fun `undo on an empty drawing is a no-op`() {
        assertTrue(Drawing().undo().isEmpty)
    }

    @Test
    fun `clear removes strokes and restores white background`() {
        val drawing =
            Drawing()
                .withCanvasSize(CanvasSize(100f, 100f))
                .fillBackground(blue)
                .addStroke(stroke(0f to 0f, 1f to 1f))
                .clear()
        assertTrue(drawing.isEmpty)
        assertEquals(0xFFFFFFFF.toInt(), drawing.backgroundColorArgb)
        assertFalse(drawing.hasExplicitBackgroundFill)
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
        val drawing =
            Drawing()
                .withCanvasSize(CanvasSize(600f, 1000f))
                .addStroke(stroke(0f to 0f, 1f to 1f))
                .clear()

        assertTrue(drawing.isEmpty)
        assertEquals(600f, drawing.canvasSize.width, 0.001f)
    }
}
