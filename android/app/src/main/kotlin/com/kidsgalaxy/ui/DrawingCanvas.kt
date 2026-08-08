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
private val GuideOutlineColor = Color(0xFF64B5F6)
private const val GuideStrokeWidth = 5f

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
                }.pointerInput(Unit) {
                    detectDragGestures(
                        onDragStart = { offset ->
                            livePoints.clear()
                            livePoints.add(offset.toPoint())
                            onStartStroke(offset.toPoint())
                        },
                        onDrag = { change, _ ->
                            val point = change.position.toPoint()
                            livePoints.add(point)
                            onContinueStroke(point)
                            change.consume()
                        },
                        onDragEnd = {
                            onEndStroke()
                            livePoints.clear()
                        },
                        onDragCancel = {
                            onEndStroke()
                            livePoints.clear()
                        },
                    )
                },
    ) {
        val guide = PlanetGuide.forCanvas(CanvasSize(size.width, size.height))

        // Guide outline sits under the strokes so the kid sees the planet edge.
        // It is not a stroke: undo/clear leave it alone and it does not arm Launch.
        if (guide.isValid) {
            drawCircle(
                color = GuideOutlineColor,
                radius = guide.radius,
                center = Offset(guide.centreX, guide.centreY),
                style =
                    Stroke(
                        width = GuideStrokeWidth,
                        cap = StrokeCap.Round,
                    ),
            )
        }

        // Clip drawing to the circle so the tablet matches what becomes the sphere.
        val drawStrokes: () -> Unit = {
            strokes.forEach { stroke ->
                if (!stroke.isRenderable) return@forEach
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

        if (guide.isValid) {
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
                drawStrokes()
            }
        } else {
            drawStrokes()
        }
    }
}
