package com.kidsgalaxy.utils

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas as AndroidCanvas
import android.graphics.Paint
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import com.kidsgalaxy.data.StrokePath
import java.io.File
import java.io.FileOutputStream

/**
 * Renders the list of strokes onto a clean square bitmap suitable for a planet texture.
 * White background so the drawing stands out when mapped onto the sphere.
 */
fun renderStrokesToBitmap(
    strokes: List<StrokePath>,
    size: Int = 1024
): Bitmap {
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = AndroidCanvas(bitmap)

    // White background
    canvas.drawColor(android.graphics.Color.WHITE)

    val paint = Paint().apply {
        isAntiAlias = true
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }

    strokes.forEach { stroke ->
        if (stroke.points.size < 2) return@forEach

        paint.color = stroke.color.toArgb()
        paint.strokeWidth = stroke.strokeWidth * (size / 800f) // scale relative to canvas

        val path = android.graphics.Path()
        val first = stroke.points.first()
        path.moveTo(first.x * size / 800f, first.y * size / 800f)

        for (i in 1 until stroke.points.size) {
            val p = stroke.points[i]
            path.lineTo(p.x * size / 800f, p.y * size / 800f)
        }
        canvas.drawPath(path, paint)
    }

    return bitmap
}

fun Bitmap.saveToCache(context: Context, filename: String = "planet.png"): File {
    val file = File(context.cacheDir, filename)
    FileOutputStream(file).use { out ->
        this.compress(Bitmap.CompressFormat.PNG, 92, out)
    }
    return file
}
