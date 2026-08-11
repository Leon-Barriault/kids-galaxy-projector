package com.kidsgalaxy.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.ClipOp
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import com.kidsgalaxy.domain.model.CanvasSize
import com.kidsgalaxy.domain.model.DEFAULT_CRATER_COLOR_ARGB
import com.kidsgalaxy.domain.model.DEFAULT_MOUNTAIN_COLOR_ARGB
import com.kidsgalaxy.domain.model.DEFAULT_RING_COLOR_ARGB
import com.kidsgalaxy.domain.model.PlanetGuide
import com.kidsgalaxy.domain.model.PlanetStyle
import com.kidsgalaxy.domain.model.Point
import com.kidsgalaxy.domain.model.StrokePath
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/** Bridges the domain's framework-free [Point] and Compose's [Offset]. */
private fun Offset.toPoint() = Point(x, y)

private fun pathThrough(points: List<Point>): Path =
    Path().apply {
        moveTo(points.first().x, points.first().y)
        for (i in 1 until points.size) {
            lineTo(points[i].x, points[i].y)
        }
    }

/** Soft blue outline so the planet edge is visible without looking like a stroke. */
private val GUIDE_OUTLINE_COLOR = Color(0xFF64B5F6)
private val LIGHT_PLANET_OUTLINE_COLOR = Color(0xFF37474F)
private val FEATURE_OUTLINE_COLOR = Color(0xFF455A64)
private val CRATER_GUIDE_COLOR = Color(0xFF4B4F58)
private const val GUIDE_STROKE_WIDTH = 5f
private const val LIGHT_GUIDE_STROKE_WIDTH = 7f
private const val LIGHT_PLANET_LUMINANCE = 0.86f

private fun ringArcPath(
    guide: PlanetGuide,
    startAngleDegrees: Float,
    sweepAngleDegrees: Float,
): Path {
    val segmentCount = 72
    val radiusX = guide.radius * 1.525f
    val radiusY = guide.radius * 0.43f
    return Path().apply {
        for (segment in 0..segmentCount) {
            val progress = segment.toFloat() / segmentCount
            val angleDegrees = startAngleDegrees + sweepAngleDegrees * progress
            val angle = Math.toRadians(angleDegrees.toDouble())
            val wobble =
                1f +
                    sin(angle * 3.0).toFloat() * 0.012f +
                    sin(angle * 7.0 + 0.9).toFloat() * 0.006f
            val point =
                Offset(
                    guide.centreX + cos(angle).toFloat() * radiusX * wobble,
                    guide.centreY + sin(angle).toFloat() * radiusY * wobble,
                )
            if (segment == 0) {
                moveTo(point.x, point.y)
            } else {
                lineTo(point.x, point.y)
            }
        }
    }
}

private fun DrawScope.drawRingPreview(
    guide: PlanetGuide,
    ringColorArgb: Int,
    front: Boolean,
) {
    val centre = Offset(guide.centreX, guide.centreY)
    val base = Color(ringColorArgb)
    val darker = lerp(base, Color.Black, 0.24f)
    val lighter = lerp(base, Color.White, 0.28f)
    val startAngle = if (front) -1f else 179f
    val path = ringArcPath(guide, startAngle, 182f)

    rotate(degrees = -14f, pivot = centre) {
        drawPath(
            path = path,
            color = FEATURE_OUTLINE_COLOR,
            style =
                Stroke(
                    width = guide.radius * 0.205f,
                    cap = StrokeCap.Round,
                    join = StrokeJoin.Round,
                ),
        )
        drawPath(
            path = path,
            color = darker,
            style =
                Stroke(
                    width = guide.radius * 0.176f,
                    cap = StrokeCap.Round,
                    join = StrokeJoin.Round,
                ),
        )
        drawPath(
            path = path,
            color = base,
            style =
                Stroke(
                    width = guide.radius * 0.13f,
                    cap = StrokeCap.Round,
                    join = StrokeJoin.Round,
                ),
        )
        drawPath(
            path = path,
            color = lighter,
            style =
                Stroke(
                    width = guide.radius * 0.052f,
                    cap = StrokeCap.Round,
                    join = StrokeJoin.Round,
                ),
        )
    }
}

private fun DrawScope.drawCraterPreview(
    guide: PlanetGuide,
    craterColorArgb: Int,
) {
    val craters =
        listOf(
            Triple(-0.34f, -0.24f, 0.22f),
            Triple(0.30f, -0.30f, 0.16f),
            Triple(0.18f, 0.20f, 0.23f),
            Triple(-0.25f, 0.34f, 0.14f),
            Triple(0.43f, 0.30f, 0.11f),
        )
    val base = Color(craterColorArgb)
    val bowl = lerp(base, Color.Black, 0.16f)
    val rim = lerp(base, Color.White, 0.17f)

    craters.forEach { (xOffset, yOffset, radiusScale) ->
        val craterCentre =
            Offset(
                guide.centreX + guide.radius * xOffset,
                guide.centreY + guide.radius * yOffset,
            )
        val craterRadius = guide.radius * radiusScale
        drawCircle(color = CRATER_GUIDE_COLOR, radius = craterRadius, center = craterCentre)
        drawCircle(color = rim, radius = craterRadius * 0.91f, center = craterCentre)
        drawCircle(color = bowl, radius = craterRadius * 0.72f, center = craterCentre)
    }
}

private fun DrawScope.drawMountainPreview(
    guide: PlanetGuide,
    mountainColorArgb: Int,
) {
    val base = Color(mountainColorArgb)
    val highlight = lerp(base, Color.White, 0.14f)
    val centre = Offset(guide.centreX, guide.centreY)
    val rangeSpecs =
        listOf(
            Triple(-0.50 * PI, 1.20f, 1.11f),
            Triple(-0.13 * PI, 1.13f, 1.18f),
            Triple(0.23 * PI, 1.17f, 1.09f),
            Triple(0.58 * PI, 1.10f, 1.15f),
            Triple(0.91 * PI, 1.16f, 1.08f),
            Triple(1.25 * PI, 1.11f, 1.17f),
        )

    fun point(
        angle: Double,
        radiusScale: Float,
    ): Offset =
        Offset(
            centre.x + cos(angle).toFloat() * guide.radius * radiusScale,
            centre.y + sin(angle).toFloat() * guide.radius * radiusScale,
        )

    rangeSpecs.forEachIndexed { index, (angle, firstHeight, secondHeight) ->
        val halfWidth = PI / 10.5
        val left = point(angle - halfWidth, 0.94f)
        val firstPeak = point(angle - halfWidth * 0.34, firstHeight)
        val saddle = point(angle + halfWidth * 0.05, 1.035f)
        val secondPeak = point(angle + halfWidth * 0.43, secondHeight)
        val right = point(angle + halfWidth, 0.94f)
        val range =
            Path().apply {
                moveTo(left.x, left.y)
                lineTo(firstPeak.x, firstPeak.y)
                quadraticBezierTo(saddle.x, saddle.y, secondPeak.x, secondPeak.y)
                lineTo(right.x, right.y)
                close()
            }
        drawPath(path = range, color = if (index % 2 == 0) base else highlight)
        drawPath(
            path = range,
            color = FEATURE_OUTLINE_COLOR,
            style = Stroke(width = 2.5f, join = StrokeJoin.Round),
        )
    }
}

@Composable
fun DrawingCanvas(
    strokes: List<StrokePath>,
    currentColorArgb: Int,
    currentStrokeWidth: Float,
    onStartStroke: (Point) -> Unit,
    onContinueStroke: (Point) -> Unit,
    onEndStroke: () -> Unit,
    onCanvasSizeChanged: (Float, Float) -> Unit,
    planetStyle: PlanetStyle = PlanetStyle.CLASSIC,
    ringColorArgb: Int = DEFAULT_RING_COLOR_ARGB,
    craterColorArgb: Int = DEFAULT_CRATER_COLOR_ARGB,
    mountainColorArgb: Int = DEFAULT_MOUNTAIN_COLOR_ARGB,
    backgroundColorArgb: Int = -1,
    modifier: Modifier = Modifier,
) {
    val livePoints = remember { mutableStateListOf<Point>() }
    var measured by remember { mutableStateOf(0f to 0f) }

    Canvas(
        modifier =
            modifier
                .fillMaxSize()
                .background(Color.White)
                .onSizeChanged { size ->
                    if (size.width > 0 && size.height > 0) {
                        val next = size.width.toFloat() to size.height.toFloat()
                        if (next != measured) {
                            measured = next
                            onCanvasSizeChanged(next.first, next.second)
                        }
                    }
                }.pointerInput(Unit) {
                    detectDragGestures(
                        onDragStart = { offset ->
                            livePoints.clear()
                            livePoints.add(offset.toPoint())
                            onStartStroke(offset.toPoint())
                        },
                        onDrag = { change, _ ->
                            change.consume()
                            livePoints.add(change.position.toPoint())
                            onContinueStroke(change.position.toPoint())
                        },
                        onDragEnd = {
                            livePoints.clear()
                            onEndStroke()
                        },
                        onDragCancel = {
                            livePoints.clear()
                            onEndStroke()
                        },
                    )
                },
    ) {
        val guide =
            if (measured.first > 0f && measured.second > 0f) {
                PlanetGuide.forCanvas(CanvasSize(measured.first, measured.second))
            } else {
                null
            }

        if (guide != null && guide.isValid) {
            val centre = Offset(guide.centreX, guide.centreY)
            val planetColor = Color(backgroundColorArgb)

            if (planetStyle == PlanetStyle.RINGED) {
                drawRingPreview(guide, ringColorArgb, front = false)
            }

            drawCircle(
                color = planetColor,
                radius = guide.radius,
                center = centre,
            )

            val clip =
                Path().apply {
                    addOval(
                        Rect(
                            left = guide.centreX - guide.radius,
                            top = guide.centreY - guide.radius,
                            right = guide.centreX + guide.radius,
                            bottom = guide.centreY + guide.radius,
                        ),
                    )
                }
            clipPath(clip, clipOp = ClipOp.Intersect) {
                for (stroke in strokes) {
                    if (!stroke.isRenderable || stroke.isBackgroundFill) continue
                    drawPath(
                        path = pathThrough(stroke.points),
                        color = Color(stroke.colorArgb),
                        style =
                            Stroke(
                                width = stroke.strokeWidth,
                                cap = StrokeCap.Round,
                                join = StrokeJoin.Round,
                            ),
                    )
                }
                if (livePoints.size >= 2) {
                    drawPath(
                        path = pathThrough(livePoints),
                        color = Color(currentColorArgb),
                        style =
                            Stroke(
                                width = currentStrokeWidth,
                                cap = StrokeCap.Round,
                                join = StrokeJoin.Round,
                            ),
                    )
                }
            }

            val lightPlanet = planetColor.luminance() >= LIGHT_PLANET_LUMINANCE
            drawCircle(
                color = if (lightPlanet) LIGHT_PLANET_OUTLINE_COLOR else GUIDE_OUTLINE_COLOR,
                radius = guide.radius,
                center = centre,
                style =
                    Stroke(
                        width = if (lightPlanet) LIGHT_GUIDE_STROKE_WIDTH else GUIDE_STROKE_WIDTH,
                    ),
            )

            when (planetStyle) {
                PlanetStyle.RINGED -> drawRingPreview(guide, ringColorArgb, front = true)
                PlanetStyle.CRATERED -> drawCraterPreview(guide, craterColorArgb)
                PlanetStyle.SPIKY -> drawMountainPreview(guide, mountainColorArgb)
                PlanetStyle.CLASSIC -> Unit
            }
        } else {
            for (stroke in strokes) {
                if (!stroke.isRenderable || stroke.isBackgroundFill) continue
                drawPath(
                    path = pathThrough(stroke.points),
                    color = Color(stroke.colorArgb),
                    style =
                        Stroke(
                            width = stroke.strokeWidth,
                            cap = StrokeCap.Round,
                            join = StrokeJoin.Round,
                        ),
                )
            }
            if (livePoints.size >= 2) {
                drawPath(
                    path = pathThrough(livePoints),
                    color = Color(currentColorArgb),
                    style =
                        Stroke(
                            width = currentStrokeWidth,
                            cap = StrokeCap.Round,
                            join = StrokeJoin.Round,
                        ),
                )
            }
        }
    }
}
