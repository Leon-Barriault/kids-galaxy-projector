package com.kidsgalaxy.domain.render

import com.kidsgalaxy.domain.model.Point
import com.kidsgalaxy.domain.model.StrokePath
import kotlin.math.max

/**
 * Maps tablet canvas coordinates onto the square planet texture.
 *
 * The drawing surface is rarely square, so a single uniform [scale] is derived
 * from the larger canvas dimension and the result is centred. That letterboxes
 * the drawing instead of stretching it - a circle the child drew stays a circle
 * once the texture is wrapped onto the sphere.
 *
 * Pure arithmetic, no Android dependency, so it is unit-tested directly.
 *
 * @param canvasWidth  measured width of the drawing surface, in pixels
 * @param canvasHeight measured height of the drawing surface, in pixels
 * @param textureSize  edge length of the square output texture
 */
class TextureProjection(
    canvasWidth: Float,
    canvasHeight: Float,
    private val textureSize: Int,
) {
    /** Falls back to an identity mapping if the canvas was never measured. */
    private val measured: Boolean = canvasWidth > 0f && canvasHeight > 0f
    private val safeWidth: Float = if (measured) canvasWidth else textureSize.toFloat()
    private val safeHeight: Float = if (measured) canvasHeight else textureSize.toFloat()

    val scale: Float =
        if (measured) textureSize / max(safeWidth, safeHeight) else 1f

    private val offsetX: Float =
        if (measured) (textureSize - safeWidth * scale) / 2f else 0f
    private val offsetY: Float =
        if (measured) (textureSize - safeHeight * scale) / 2f else 0f

    fun map(point: Point): Point =
        Point(
            x = point.x * scale + offsetX,
            y = point.y * scale + offsetY,
        )

    /** Brush width must scale with the drawing so line weight stays proportional. */
    fun scaleStrokeWidth(width: Float): Float = width * scale

    fun project(stroke: StrokePath): StrokePath =
        stroke.copy(
            points = stroke.points.map(::map),
            strokeWidth = scaleStrokeWidth(stroke.strokeWidth),
        )
}
