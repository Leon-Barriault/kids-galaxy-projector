package com.kidsgalaxy.domain.model

/**
 * Domain model - deliberately free of Android and Compose types.
 *
 * Using a plain [Point] and an ARGB [Int] instead of Compose's `Offset`/`Color`
 * keeps this layer testable on the JVM and independent of the UI toolkit.
 */
data class Point(val x: Float, val y: Float)

/** A single brush stroke: the path, its colour, and its width in canvas pixels. */
data class StrokePath(
    val points: List<Point>,
    val colorArgb: Int,
    val strokeWidth: Float,
) {
    /** A stroke needs at least two points to draw a line. */
    val isRenderable: Boolean get() = points.size >= 2
}

/**
 * Size of the surface a drawing was made on, in pixels.
 * Needed to project canvas coordinates onto the square texture without distortion.
 */
data class CanvasSize(val width: Float, val height: Float) {
    val isMeasured: Boolean get() = width > 0f && height > 0f

    companion object {
        /** Before the first layout pass the surface has no size yet. */
        val Unmeasured = CanvasSize(0f, 0f)
    }
}

/**
 * The child's drawing: an immutable stroke history with undo/clear semantics,
 * plus the size of the surface it was drawn on.
 * Every operation returns a new instance, so state changes are explicit.
 */
data class Drawing(
    val strokes: List<StrokePath> = emptyList(),
    val canvasSize: CanvasSize = CanvasSize.Unmeasured,
) {

    val isEmpty: Boolean get() = strokes.isEmpty()

    fun withCanvasSize(size: CanvasSize): Drawing =
        if (size == canvasSize) this else copy(canvasSize = size)

    /** Adds a stroke, ignoring taps and empty paths that would render nothing. */
    fun addStroke(stroke: StrokePath): Drawing =
        if (stroke.isRenderable) copy(strokes = strokes + stroke) else this

    fun undo(): Drawing =
        if (strokes.isEmpty()) this else copy(strokes = strokes.dropLast(1))

    /** Clears strokes but keeps the measured canvas size. */
    fun clear(): Drawing =
        if (strokes.isEmpty()) this else copy(strokes = emptyList())
}
