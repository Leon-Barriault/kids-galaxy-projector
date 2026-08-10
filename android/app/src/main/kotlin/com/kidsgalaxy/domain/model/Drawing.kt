package com.kidsgalaxy.domain.model

/**
 * Domain model - deliberately free of Android and Compose types.
 *
 * Using a plain [Point] and an ARGB [Int] instead of Compose's `Offset`/`Color`
 * keeps this layer testable on the JVM and independent of the UI toolkit.
 */
data class Point(
    val x: Float,
    val y: Float,
)

/** A single brush stroke: the path, its colour, and its width in canvas pixels. */
data class StrokePath(
    val points: List<Point>,
    val colorArgb: Int,
    val strokeWidth: Float,
    /** True only for the synthetic stroke used to paint the planet background. */
    val isBackgroundFill: Boolean = false,
) {
    /** A stroke needs at least two points to draw a line. */
    val isRenderable: Boolean get() = points.size >= 2
}

/**
 * Size of the surface a drawing was made on, in pixels.
 * Needed to project canvas coordinates onto the square texture without distortion.
 */
data class CanvasSize(
    val width: Float,
    val height: Float,
) {
    val isMeasured: Boolean get() = width > 0f && height > 0f

    companion object {
        /** Before the first layout pass the surface has no size yet. */
        val Unmeasured = CanvasSize(0f, 0f)
    }
}

/**
 * The child's drawing: an immutable stroke history, an explicit planet-body
 * background colour, and the size of the surface it was drawn on.
 *
 * The background is deliberately separate metadata from the child's authored
 * brush strokes. For immediate tablet preview/export we also keep one synthetic
 * fill stroke at the start of [strokes]. It is always underneath authored
 * strokes, so changing the bucket never rewrites or covers their history.
 */
data class Drawing(
    val strokes: List<StrokePath> = emptyList(),
    val canvasSize: CanvasSize = CanvasSize.Unmeasured,
    val backgroundColorArgb: Int = DEFAULT_BACKGROUND_COLOR_ARGB,
    val hasExplicitBackgroundFill: Boolean = false,
) {
    /** A deliberate bucket fill is a valid planet even before brush strokes are added. */
    val isEmpty: Boolean
        get() = strokes.none { !it.isBackgroundFill } && !hasExplicitBackgroundFill

    fun withCanvasSize(size: CanvasSize): Drawing {
        if (size == canvasSize) return this
        val resized = copy(canvasSize = size)
        return if (hasExplicitBackgroundFill) resized.withBackgroundStroke() else resized
    }

    /** Adds a child-authored stroke, ignoring taps and empty paths. */
    fun addStroke(stroke: StrokePath): Drawing =
        if (stroke.isRenderable) copy(strokes = strokes + stroke.copy(isBackgroundFill = false)) else this

    /**
     * Change only the planet background. Existing child strokes are preserved
     * exactly and remain above the generated fill stroke.
     */
    fun fillBackground(colorArgb: Int): Drawing =
        copy(
            backgroundColorArgb = colorArgb or 0xFF000000.toInt(),
            hasExplicitBackgroundFill = true,
        ).withBackgroundStroke()

    fun undo(): Drawing {
        val authoredIndex = strokes.indexOfLast { !it.isBackgroundFill }
        if (authoredIndex >= 0) {
            return copy(strokes = strokes.filterIndexed { index, _ -> index != authoredIndex })
        }
        return if (hasExplicitBackgroundFill) {
            copy(
                strokes = strokes.filterNot { it.isBackgroundFill },
                backgroundColorArgb = DEFAULT_BACKGROUND_COLOR_ARGB,
                hasExplicitBackgroundFill = false,
            )
        } else {
            this
        }
    }

    /** Reset the complete artwork to the default white planet background. */
    fun clear(): Drawing =
        copy(
            strokes = emptyList(),
            backgroundColorArgb = DEFAULT_BACKGROUND_COLOR_ARGB,
            hasExplicitBackgroundFill = false,
        )

    private fun withBackgroundStroke(): Drawing {
        if (!canvasSize.isMeasured) return copy(strokes = strokes.filterNot { it.isBackgroundFill })
        val centreY = canvasSize.height / 2f
        val fill =
            StrokePath(
                points = listOf(Point(0f, centreY), Point(canvasSize.width, centreY)),
                colorArgb = backgroundColorArgb,
                strokeWidth = maxOf(canvasSize.width, canvasSize.height) * 2.2f,
                isBackgroundFill = true,
            )
        return copy(strokes = listOf(fill) + strokes.filterNot { it.isBackgroundFill })
    }

    companion object {
        const val DEFAULT_BACKGROUND_COLOR_ARGB: Int = 0xFFFFFFFF.toInt()
    }
}
