package com.kidsgalaxy.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.RocketLaunch
import androidx.compose.material.icons.filled.Undo
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kidsgalaxy.R

/** Palette offered to the child, as ARGB ints matching the domain model. */
val kidColorsArgb: List<Int> =
    listOf(
        0xFFE53935.toInt(), // red
        0xFFFF9800.toInt(), // orange
        0xFFFFEB3B.toInt(), // yellow
        0xFF4CAF50.toInt(), // green
        0xFF2196F3.toInt(), // blue
        0xFF9C27B0.toInt(), // purple
        0xFFE91E63.toInt(), // pink
        0xFF000000.toInt(), // black
    )

private val brushSizes = listOf(16f, 28f, 48f)

@Composable
fun DrawingControls(
    selectedColorArgb: Int,
    onColorChange: (Int) -> Unit,
    strokeWidth: Float,
    onStrokeWidthChange: (Float) -> Unit,
    isSending: Boolean,
    canLaunch: Boolean,
    canUndo: Boolean,
    onUndo: () -> Unit,
    onClear: () -> Unit,
    onLaunch: () -> Unit,
) {
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surface)
                .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text(
            stringResource(R.string.pick_a_color),
            style = MaterialTheme.typography.titleMedium,
        )
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            kidColorsArgb.forEach { colorArgb ->
                val selected = colorArgb == selectedColorArgb
                Box(
                    modifier =
                        Modifier
                            .size(if (selected) 52.dp else 46.dp)
                            .clip(CircleShape)
                            .background(Color(colorArgb))
                            .then(
                                if (selected) {
                                    Modifier.border(4.dp, Color.White, CircleShape)
                                } else {
                                    Modifier
                                },
                            )
                            // selectable (not clickable) so the state is announced
                            // to accessibility services.
                            .selectable(
                                selected = selected,
                                role = Role.RadioButton,
                                onClick = { onColorChange(colorArgb) },
                            ),
                )
            }
        }

        Text(
            stringResource(R.string.brush_size),
            style = MaterialTheme.typography.titleMedium,
        )
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            brushSizes.forEach { width ->
                val selected = strokeWidth == width
                Button(
                    onClick = { onStrokeWidthChange(width) },
                    colors =
                        ButtonDefaults.buttonColors(
                            containerColor =
                                if (selected) {
                                    MaterialTheme.colorScheme.primary
                                } else {
                                    MaterialTheme.colorScheme.surfaceVariant
                                },
                        ),
                    modifier = Modifier.weight(1f),
                ) {
                    Text(stringResource(labelFor(width)), fontSize = 16.sp)
                }
            }
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            OutlinedButton(
                onClick = onUndo,
                enabled = canUndo,
                modifier = Modifier.weight(1f),
            ) {
                Icon(Icons.Default.Undo, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text(stringResource(R.string.undo))
            }

            OutlinedButton(
                onClick = onClear,
                enabled = canUndo,
                modifier = Modifier.weight(1f),
                colors =
                    ButtonDefaults.outlinedButtonColors(
                        contentColor = MaterialTheme.colorScheme.error,
                    ),
            ) {
                Icon(Icons.Default.Clear, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text(stringResource(R.string.clear))
            }
        }

        Button(
            onClick = onLaunch,
            enabled = canLaunch,
            modifier =
                Modifier
                    .fillMaxWidth()
                    .height(64.dp),
            shape = RoundedCornerShape(16.dp),
            colors =
                ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.secondary,
                ),
        ) {
            if (isSending) {
                CircularProgressIndicator(
                    modifier = Modifier.size(28.dp),
                    color = MaterialTheme.colorScheme.onSecondary,
                    strokeWidth = 3.dp,
                )
                Spacer(Modifier.width(12.dp))
                Text(stringResource(R.string.sending_to_galaxy), fontSize = 18.sp)
            } else {
                Icon(
                    Icons.Default.RocketLaunch,
                    contentDescription = null,
                    modifier = Modifier.size(28.dp),
                )
                Spacer(Modifier.width(12.dp))
                Text(stringResource(R.string.launch_into_galaxy), fontSize = 18.sp)
            }
        }
    }
}

private fun labelFor(width: Float): Int =
    when (width) {
        16f -> R.string.brush_small
        48f -> R.string.brush_big
        else -> R.string.brush_medium
    }
