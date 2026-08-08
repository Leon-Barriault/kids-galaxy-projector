package com.kidsgalaxy.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.ClipOp
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.IntSize
import com.kidsgalaxy.domain.model.Point
import com.kidsgalaxy.domain.model.PlanetGuide
import com.kidsgalaxy.domain.model.StrokePath

private fun Offset.toPoint() = Point(x, y)

private fun pathThrough(points: List\u003cPoint\u003e): Path =
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
    strokes: List\u003cStrokePath\u003e,
    currentColorArgb: Int,
    currentStrokeWidth: Float,
    onStartStroke: (Point) -> Unit,
    onContinueStroke: (Point) -> Unit,
    onEndStroke: () -> Unit,
    onCanvasSizeChanged: (Float, Float) -> Unit,
    modifier: Modifier = Modifier,
) {
    val guide = remember { PlanetGuide.forCanvas(com.kidsgalaxy.domain.model.CanvasSize(0f, 0f)) }
    // guide is recomputed from size below via side-effect-free forCanvas each draw.

    Canvas(
        modifier =
            modifier
                .fillMaxSize()
                .background(Color.White)
                .onSizeChanged { size: IntSize ->
                    onCanvasSizeChanged(size.width.toFloat(), size.height.toFloat())
                }.pointerInput(Unit) {
                    detectDragGestures(
                        onDragStart = { offset ->
                            onStartStroke(offset.toPoint())
                        },
                        onDrag = { change, _ ->
                            onContinueStroke(change.position.toPoint())
                        },
                        onDragEnd = { onEndStroke() },
                        onDragCancel = { onEndStroke() },
                    )
                },
    ) {
        val canvasGuide =
            PlanetGuide.forCanvas(
                com.kidsgalaxy.domain.model.CanvasSize(size.width, size.height),
            )
        val guide = canvasGuide

        // Guide outline sits under the strokes so the kid sees the planet edge.
        // It is not a stroke: undo/clear leave it alone and it does not arm Launch.
        if (guide.isValid) {
            drawCircle(
                color = GUIDE_OUTLINE_COLOR,
                radius = guide.radius,
                center = Offset(guide.centreX, guide.centreY),
                style =
                    Stroke(
                        width = GUIDE_STROKE_WIDTH,
                        cap = StrokeCap.Round,
                    ),
            )
        }

        // Clip drawing to the circle so the tablet matches what becomes the sphere.
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
                for (stroke in strokes) {
                    if (!stroke.isRenderable) continue
                    drawPath(
                        path = pathThrough(stroke.points),
                        color = Color(stroke.colorArgb),
                        style =
                            Stroke(
                                width = stroke.width,
                                cap = StrokeCap.Round,
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
                            width = stroke.width,
                            cap = StrokeCap.Round,
                        ),
                )
            }
        }
    }
}
