package com.kidsgalaxy.domain.render

import com.kidsgalaxy.domain.model.PlanetGuide
import com.kidsgalaxy.domain.model.Point
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/**
 * Polar (globe-style) mapping from an equirectangular texture texel back onto
 * the source disc defined by a [PlanetGuide].
 *
 * Reverse mapping (output → source) keeps the resample loop dense with no gaps:
 * every output pixel has exactly one sample point. The disc centre becomes the
 * north pole; the rim becomes the south pole — every part of the drawing covers
 * the sphere.
 *
 * Pure arithmetic, no Android dependency.
 *
 * @param outputWidth  equirectangular width (typically 2× height)
 * @param outputHeight equirectangular height
 * @param guide        disc centre and radius in source-pixel coordinates
 */
class SphericalProjection(
    private val outputWidth: Int,
    private val outputHeight: Int,
    private val guide: PlanetGuide,
) {
    init {
        require(outputWidth > 0) { "outputWidth must be positive" }
        require(outputHeight > 0) { "outputHeight must be positive" }
    }

    /**
     * Maps an output texel (integer pixel coords) to a continuous source-disc point.
     *
     * ```
     * v = (y + 0.5) / H   // colatitude fraction, 0 at north pole
     * u = (x + 0.5) / W   // longitude fraction
     * θ = v · π
     * φ = u · 2π
     * r = v               // radial distance on the disc, 0..1
     * source = centre + r · R · (cos φ, sin φ)
     * ```
     */
    fun sourcePoint(x: Int, y: Int): Point {
        val v = (y + 0.5f) / outputHeight
        val u = (x + 0.5f) / outputWidth
        val phi = u * (2.0 * PI)
        val r = v.coerceIn(0f, 1f)
        val sourceX = guide.centreX + r * guide.radius * cos(phi).toFloat()
        val sourceY = guide.centreY + r * guide.radius * sin(phi).toFloat()
        return Point(sourceX, sourceY)
    }

    companion object {
        /** Default equirectangular size used by the Android renderer (2:1). */
        const val DEFAULT_WIDTH = 1024
        const val DEFAULT_HEIGHT = 512
    }
}
