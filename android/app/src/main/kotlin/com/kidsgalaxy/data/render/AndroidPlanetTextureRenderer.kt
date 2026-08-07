package com.kidsgalaxy.data.render

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import com.kidsgalaxy.domain.model.Drawing
import com.kidsgalaxy.domain.render.PlanetTextureRenderer
import com.kidsgalaxy.domain.render.TextureProjection
import java.io.ByteArrayOutputStream

/**
 * Android implementation of [PlanetTextureRenderer].
 *
 * The only place in the app that touches `android.graphics`. The coordinate
 * mathematics lives in [TextureProjection], which is pure and unit-tested; this
 * class is the thin adapter that draws the projected geometry onto a Bitmap.
 */
class AndroidPlanetTextureRenderer(
    private val textureSize: Int = DEFAULT_TEXTURE_SIZE,
) : PlanetTextureRenderer {
    override fun renderPng(drawing: Drawing): ByteArray {
        val bitmap = Bitmap.createBitmap(textureSize, textureSize, Bitmap.Config.ARGB_8888)
        try {
            drawInto(bitmap, drawing)
            return bitmap.toPngBytes()
        } finally {
            bitmap.recycle()
        }
    }

    private fun drawInto(
        bitmap: Bitmap,
        drawing: Drawing,
    ) {
        val canvas = Canvas(bitmap)
        // White background so the drawing stands out on the sphere.
        canvas.drawColor(Color.WHITE)

        val projection =
            TextureProjection(
                canvasWidth = drawing.canvasSize.width,
                canvasHeight = drawing.canvasSize.height,
                textureSize = textureSize,
            )

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
    }

    /** PNG is lossless, so the quality argument is a no-op (100 by convention). */
    private fun Bitmap.toPngBytes(): ByteArray =
        ByteArrayOutputStream().use { out ->
            compress(Bitmap.CompressFormat.PNG, 100, out)
            out.toByteArray()
        }

    companion object {
        const val DEFAULT_TEXTURE_SIZE = 1024
    }
}
