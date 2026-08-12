package com.kidsgalaxy.data.remote

import com.google.gson.Gson
import com.google.gson.annotations.SerializedName
import com.kidsgalaxy.domain.model.Drawing
import kotlin.math.max

private const val DRAWING_MANIFEST_VERSION = 1
private const val NORMALIZED_COORDINATE_SPACE = "normalized-canvas-v1"

/**
 * Machine-readable companion to the flattened PNG sent by the kid tablet.
 *
 * The PNG remains the archival drawing. This manifest preserves the information
 * that cannot be recovered reliably after rasterisation: which colour is the
 * background/body, which marks are authored strokes, their order, width, and
 * original path through the drawing canvas.
 */
internal data class DrawingManifestDto(
    val version: Int = DRAWING_MANIFEST_VERSION,
    @SerializedName("coordinate_space")
    val coordinateSpace: String = NORMALIZED_COORDINATE_SPACE,
    val canvas: DrawingManifestCanvasDto,
    @SerializedName("background_color")
    val backgroundColor: String,
    @SerializedName("background_explicit")
    val backgroundExplicit: Boolean,
    val strokes: List<DrawingManifestStrokeDto>,
    val raster: DrawingManifestRasterDto = DrawingManifestRasterDto(),
)

internal data class DrawingManifestCanvasDto(
    val width: Float,
    val height: Float,
)

internal data class DrawingManifestStrokeDto(
    val order: Int,
    val color: String,
    @SerializedName("width_px")
    val widthPx: Float,
    @SerializedName("width_normalized")
    val widthNormalized: Float,
    val points: List<List<Float>>,
)

internal data class DrawingManifestRasterDto(
    @SerializedName("background_fill")
    val backgroundFill: String = "solid",
    @SerializedName("stroke_cap")
    val strokeCap: String = "round",
    @SerializedName("stroke_join")
    val strokeJoin: String = "round",
    @SerializedName("stroke_order")
    val strokeOrder: String = "oldest-to-newest",
)

internal object DrawingManifestSerializer {
    private val gson = Gson()

    fun toJson(drawing: Drawing): String = gson.toJson(toDto(drawing))

    fun toDto(drawing: Drawing): DrawingManifestDto {
        val width = max(1f, drawing.canvasSize.width)
        val height = max(1f, drawing.canvasSize.height)
        val widthScale = max(1f, minOf(width, height))
        val authored = drawing.strokes.filterNot { it.isBackgroundFill }

        return DrawingManifestDto(
            canvas = DrawingManifestCanvasDto(width = width, height = height),
            backgroundColor = drawing.backgroundColorArgb.toRgbHex(),
            backgroundExplicit = drawing.hasExplicitBackgroundFill,
            strokes =
                authored.mapIndexed { order, stroke ->
                    DrawingManifestStrokeDto(
                        order = order,
                        color = stroke.colorArgb.toRgbHex(),
                        widthPx = stroke.strokeWidth,
                        widthNormalized = (stroke.strokeWidth / widthScale).coerceIn(0f, 1f),
                        points =
                            stroke.points.map { point ->
                                listOf(
                                    (point.x / width).coerceIn(0f, 1f),
                                    (point.y / height).coerceIn(0f, 1f),
                                )
                            },
                    )
                },
        )
    }
}

private fun Int.toRgbHex(): String = "#%06x".format(this and 0x00FFFFFF)
