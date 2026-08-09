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
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.ClipOp
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.rotate
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
private val CRATER_GUIDE_COLOR = Color(0xFF4B4F58)
private const val GUIDE_STROKE_WIDTH = 5f

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
    modifier: Modifier = Modifier,
) {
    // Only the in-flight stroke lives here; the ViewModel owns committed strokes.
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
            when (planetStyle) {
                PlanetStyle.RINGED -> {
                    val ringWidth = guide.radius * 2.75f
                    val ringHeight = guide.radius * 0.72f
                    rotate(degrees = -14f, pivot = centre) {
                        drawOval(
                            color = Color(ringColorArgb),
                            topLeft =
                                Offset(
                                    guide.centreX - ringWidth / 2f,
                                    guide.centreY - ringHeight / 2f,
                                ),
                            size = Size(ringWidth, ringHeight),
                            style = Stroke(width = guide.radius * 0.11f),
                        )
                    }
                }

                PlanetStyle.SPIKY -> {
                    val peakCount = 8
                    repeat(peakCount) { index ->
                        val angle = (2.0 * PI * index / peakCount) - PI / 2.0
                        val halfBaseAngle = PI / 18.0
                        val heightScale =
                            when (index % 4) {
                                0 -> 1.24f
                                1 -> 1.16f
                                2 -> 1.20f
                                else -> 1.12f
                            }
                        val baseRadius = guide.radius * 0.97f
                        val tipRadius = guide.radius * heightScale
                        val left =
                            Offset(
                                guide.centreX + cos(angle - halfBaseAngle).toFloat() * baseRadius,
                                guide.centreY + sin(angle - halfBaseAngle).toFloat() * baseRadius,
                            )
                        val tip =
                            Offset(
                                guide.centreX + cos(angle).toFloat() * tipRadius,
                                guide.centreY + sin(angle).toFloat() * tipRadius,
                            )
                        val right =
                            Offset(
                                guide.centreX + cos(angle + halfBaseAngle).toFloat() * baseRadius,
                                guide.centreY + sin(angle + halfBaseAngle).toFloat() * baseRadius,
                            )
                        val peak =
                            Path().apply {
                                moveTo(left.x, left.y)
                                lineTo(tip.x, tip.y)
                                lineTo(right.x, right.y)
                                close()
                            }
                        drawPath(path = peak, color = Color(mountainColorArgb))
                        drawPath(
                            path = peak,
                            color = GUIDE_OUTLINE_COLOR,
                            style = Stroke(width = 2.5f),
                        )
                    }
                }

                else -> Unit
            }

            // The paintable texture stays the same guide disc for every form.
            drawCircle(
                color = GUIDE_OUTLINE_COLOR,
                radius = guide.radius,
                center = centre,
                style = Stroke(width = GUIDE_STROKE_WIDTH),
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
                    if (!stroke.isRenderable) continue
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

            if (planetStyle == PlanetStyle.CRATERED) {
                val craters =
                    listOf(
                        Triple(-0.34f, -0.24f, 0.22f),
                        Triple(0.30f, -0.30f, 0.16f),
                        Triple(0.18f, 0.20f, 0.23f),
                        Triple(-0.25f, 0.34f, 0.14f),
                        Triple(0.43f, 0.30f, 0.11f),
                    )
                craters.forEach { (xOffset, yOffset, radiusScale) ->
                    val craterCentre =
                        Offset(
                            guide.centreX + guide.radius * xOffset,
                            guide.centreY + guide.radius * yOffset,
                        )
                    val craterRadius = guide.radius * radiusScale
                    drawCircle(
                        color = Color(craterColorArgb),
                        radius = craterRadius,
                        center = craterCentre,
                    )
                    drawCircle(
                        color = CRATER_GUIDE_COLOR,
                        radius = craterRadius,
                        center = craterCentre,
                        style = Stroke(width = 3f),
                    )
                }
            }
        } else {
            for (stroke in strokes) {
                if (!stroke.isRenderable) continue
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
