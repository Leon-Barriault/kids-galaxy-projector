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
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import com.kidsgalaxy.domain.model.CanvasSize
import com.kidsgalaxy.domain.model.PlanetGuide
import com.kidsgalaxy.domain.model.Point
import com.kidsgalaxy.domain.model.StrokePath

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
                }
                .pointerInput(Unit) {
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

        // Soft outline of the guide disc (always drawn, never clipped away).
        if (guide != null && guide.isValid) {
            drawCircle(
                color = GUIDE_OUTLINE_COLOR,
                radius = guide.radius,
                center = Offset(guide.centreX, guide.centreY),
                style = Stroke(width = GUIDE_STROKE_WIDTH),
            )
        }

        if (guide != null && guide.isValid) {
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
