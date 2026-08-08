package com.kidsgalaxy.data.render

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import com.kidsgalaxy.domain.model.Drawing
import com.kidsgalaxy.domain.model.PlanetGuide
import com.kidsgalaxy.domain.render.PlanetTextureRenderer
import com.kidsgalaxy.domain.render.SphericalProjection
import com.kidsgalaxy.domain.render.TextureProjection
import java.io.ByteArrayOutputStream
import kotlin.math.roundToInt

/**
 * Android implementation of [PlanetTextureRenderer].
 *
 * The only place in the app that touches `android.graphics`. Coordinate
 * mathematics live in [TextureProjection] and [SphericalProjection]; this
 * class is the thin adapter that draws and resamples.
 *
 * Two stages:
 * 1. Render strokes into a square disc bitmap, clipped to the [PlanetGuide]
 *    so anything outside the circle is dropped. Background stays white.
 * 2. Resample that disc into an equirectangular bitmap through polar
 *    [SphericalProjection], then PNG-encode the result.
 *
 * Pixel access uses [IntArray] bulk reads/writes — 1024×512 is half a million
 * lookups and per-call `getPixel` overhead would dominate on a tablet.
 */
class AndroidPlanetTextureRenderer(
    private val discSize: Int = DEFAULT_DISC_SIZE,
    private val equirectWidth: Int = SphericalProjection.DEFAULT_WIDTH,
    private val equirectHeight: Int = SphericalProjection.DEFAULT_HEIGHT,
) : PlanetTextureRenderer {
    override fun renderPng(drawing: Drawing): ByteArray {
        val disc = Bitmap.createBitmap(discSize, discSize, Bitmap.Config.ARGB_8888)
        try {
            val texGuide = drawDisc(disc, drawing)
            val equirect = resampleToEquirectangular(disc, texGuide)
            try {
                return equirect.toPngBytes()
            } finally {
                equirect.recycle()
            }
        } finally {
            disc.recycle()
        }
    }

    /**
     * Stage 1: square disc with white background, strokes clipped to the guide.
     *
     * @return the guide projected into disc-pixel coordinates, ready for stage 2
     */
    private fun drawDisc(
        bitmap: Bitmap,
        drawing: Drawing,
    ): PlanetGuide {
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)

        val projection =
            TextureProjection(
                canvasWidth = drawing.canvasSize.width,
                canvasHeight = drawing.canvasSize.height,
                textureSize = discSize,
            )
        val canvasGuide = PlanetGuide.forCanvas(drawing.canvasSize)
        val texGuide = projection.mapGuide(canvasGuide)

        if (texGuide.isValid) {
            val clipPath =
                Path().apply {
                    addCircle(texGuide.centreX, texGuide.centreY, texGuide.radius, Path.Direction.CW)
                }
            canvas.save()
            canvas.clipPath(clipPath)
        }

        val paint =
            Paint().apply {
                isAntiAlias = true
                style = Paint.Style.STROKE
                strokeCap = Paint.Cap.ROUND
                strokeJoin = Paint.Join.ROUND
            }

        drawing.strokes.forEach { stroke ->
            if (!stroke.isRenderable) return@forEach

            val projected = projection.project(stroke)
            paint.color = projected.colorArgb
            paint.strokeWidth = projected.strokeWidth

            val path = Path()
            val first = projected.points.first()
            path.moveTo(first.x, first.y)
            projected.points.drop(1).forEach { path.lineTo(it.x, it.y) }
            canvas.drawPath(path, paint)
        }

        if (texGuide.isValid) {
            canvas.restore()
        }

        return texGuide
    }

    /**
     * Stage 2: polar resample of the disc into an equirectangular texture.
     *
     * Nearest-neighbour is intentional — the source is 1024² so detail is
     * plentiful, and the polar pole region is oversampled by construction.
     */
    private fun resampleToEquirectangular(
        disc: Bitmap,
        texGuide: PlanetGuide,
    ): Bitmap {
        val srcPixels = IntArray(discSize * discSize)
        disc.getPixels(srcPixels, 0, discSize, 0, 0, discSize, discSize)

        val dstPixels = IntArray(equirectWidth * equirectHeight)
        val spherical = SphericalProjection(equirectWidth, equirectHeight, texGuide)
        val maxIndex = discSize - 1

        for (y in 0 until equirectHeight) {
            val rowOffset = y * equirectWidth
            for (x in 0 until equirectWidth) {
                val src = spherical.sourcePoint(x, y)
                val sx = src.x.roundToInt().coerceIn(0, maxIndex)
                val sy = src.y.roundToInt().coerceIn(0, maxIndex)
                dstPixels[rowOffset + x] = srcPixels[sy * discSize + sx]
            }
        }

        val equirect = Bitmap.createBitmap(equirectWidth, equirectHeight, Bitmap.Config.ARGB_8888)
        equirect.setPixels(dstPixels, 0, equirectWidth, 0, 0, equirectWidth, equirectHeight)
        return equirect
    }

    /** PNG is lossless, so the quality argument is a no-op (100 by convention). */
    private fun Bitmap.toPngBytes(): ByteArray =
        ByteArrayOutputStream().use { out ->
            compress(Bitmap.CompressFormat.PNG, 100, out)
            out.toByteArray()
        }

    companion object {
        /** Square disc edge length before polar expansion. */
        const val DEFAULT_DISC_SIZE = 1024
    }
}
