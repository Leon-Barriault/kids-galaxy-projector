package com.kidsgalaxy.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import com.kidsgalaxy.data.StrokePath

@Composable
fun DrawingCanvas(
    strokes: List<StrokePath>,
    currentColor: Color,
    currentStrokeWidth: Float,
    onStartStroke: (Offset) -> Unit,
    onContinueStroke: (Offset) -> Unit,
    onEndStroke: () -> Unit,
    modifier: Modifier = Modifier
) {
    var currentPath by remember { mutableStateOf(Path()) }
    var currentPoints by remember { mutableStateOf(listOf<Offset>()) }

    Canvas(
        modifier = modifier
            .fillMaxSize()
            .background(Color.White)
            .pointerInput(Unit) {
                detectDragGestures(
                    onDragStart = { offset ->
                        currentPath = Path().apply { moveTo(offset.x, offset.y) }
                        currentPoints = listOf(offset)
                        onStartStroke(offset)
                    },
                    onDrag = { change, _ ->
                        val newPoint = change.position
                        currentPath.lineTo(newPoint.x, newPoint.y)
                        currentPoints = currentPoints + newPoint
                        onContinueStroke(newPoint)
                        change.consume()
                    },
                    onDragEnd = {
                        onEndStroke()
                        currentPath = Path()
                        currentPoints = emptyList()
                    }
                )
            }
    ) {
        // Draw finished strokes
        strokes.forEach { stroke ->
            if (stroke.points.size < 2) return@forEach
            val path = Path().apply {
                moveTo(stroke.points.first().x, stroke.points.first().y)
                stroke.points.drop(1).forEach { lineTo(it.x, it.y) }
            }
            drawPath(
                path = path,
                color = stroke.color,
                style = Stroke(
                    width = stroke.strokeWidth,
                    cap = StrokeCap.Round,
                    join = StrokeJoin.Round
                )
            )
        }

        // Draw the stroke currently being drawn
        if (currentPoints.size >= 2) {
            drawPath(
                path = currentPath,
                color = currentColor,
                style = Stroke(
                    width = currentStrokeWidth,
                    cap = StrokeCap.Round,
                    join = StrokeJoin.Round
                )
            )
        }
    }
}
