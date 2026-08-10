package com.kidsgalaxy.data.render

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import com.kidsgalaxy.domain.model.Drawing
import com.kidsgalaxy.domain.model.PlanetGuide
import com.kidsgalaxy.domain.render.PlanetTextureRenderer
import com.kidsgalaxy.domain.render.TextureProjection
import java.io.ByteArrayOutputStream

/**
 * Android implementation of [PlanetTextureRenderer].
 *
 * The tablet now uploads the child's actual circular drawing, not a spherical
 * texture. That distinction is deliberate: the projector owns the artistic
 * interpretation of the drawing and can use the same visible design as art
 * direction for the whole 3D planet without requiring a child to paint hidden
 * faces.
 *
 * The previous implementation converted the disc with a polar mapping where
 * the centre became the north pole and the rim became the south pole. That
 * preserved every pixel mathematically but destroyed the recognizable layout
 * the child had just drawn. Existing stored 2:1 PNGs are decoded back to their
 * original disc by the projector for backwards compatibility.
 */
class AndroidPlanetTextureRenderer(
    private val discSize: Int = DEFAULT_DISC_SIZE,
) : PlanetTextureRenderer {
    override fun renderPng(drawing: Drawing): ByteArray {
        val disc = Bitmap.createBitmap(discSize, discSize, Bitmap.Config.ARGB_8888)
        return try {
            drawDisc(disc, drawing)
            disc.toPngBytes()
        } finally {
            disc.recycle()
        }
    }

    /**
     * Render a square canvas using the planet-body colour, then draw only the
     * child's strokes clipped to the circular planet guide. Ring/crater/mountain
     * preview guides are UI affordances and are intentionally not baked into
     * the uploaded artwork.
     */
    private fun drawDisc(
        bitmap: Bitmap,
        drawing: Drawing,
    ) {
        val canvas = Canvas(bitmap)
        // Match the pixels outside the circular guide to the selected body colour.
        // A white backing canvas can bleed through the anti-aliased clip edge and
        // otherwise look like an authored white ring to the projector.
        canvas.drawColor(drawing.backgroundColorArgb)

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
    }

    /** PNG is lossless, so the quality argument is a no-op (100 by convention). */
    private fun Bitmap.toPngBytes(): ByteArray =
        ByteArrayOutputStream().use { out ->
            compress(Bitmap.CompressFormat.PNG, 100, out)
            out.toByteArray()
        }

    companion object {
        /** Square drawing-disc edge length sent to the projector. */
        const val DEFAULT_DISC_SIZE = 1024
    }
}
