package com.kidsgalaxy.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.RocketLaunch
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

val kidColorsArgb: List<Int> =
    listOf(
        0xFFE53935.toInt(),
        0xFFFF9800.toInt(),
        0xFFFFEB3B.toInt(),
        0xFF4CAF50.toInt(),
        0xFF2196F3.toInt(),
        0xFF9C27B0.toInt(),
        0xFFE91E63.toInt(),
        0xFF000000.toInt(),
        0xFFFFFFFF.toInt(),
    )

private val brushSizes = listOf(16f, 28f, 48f)
private val TOUCH_TARGET = 48.dp
private val SELECTED_TOUCH_TARGET = 56.dp

@OptIn(ExperimentalLayoutApi::class)
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
    modifier: Modifier = Modifier,
    showLaunchAction: Boolean = false,
) {
    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surface)
                .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(stringResource(R.string.pick_a_color), style = MaterialTheme.typography.titleMedium)

        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            kidColorsArgb.forEach { colorArgb ->
                val selected = colorArgb == selectedColorArgb
                val isWhite = colorArgb == 0xFFFFFFFF.toInt()
                Box(
                    modifier =
                        Modifier
                            .size(if (selected) SELECTED_TOUCH_TARGET else TOUCH_TARGET)
                            .clip(CircleShape)
                            .background(Color(colorArgb))
                            .then(
                                when {
                                    selected -> Modifier.border(4.dp, MaterialTheme.colorScheme.primary, CircleShape)
                                    isWhite -> Modifier.border(2.dp, MaterialTheme.colorScheme.outline, CircleShape)
                                    else -> Modifier
                                },
                            ).selectable(
                                selected = selected,
                                role = Role.RadioButton,
                                onClick = { onColorChange(colorArgb) },
                            ),
                )
            }
        }

        OutlinedButton(
            onClick = {
                // Alpha=0 is reserved by DrawingViewModel as a bucket-fill
                // command. The selected RGB remains unchanged.
                onColorChange(selectedColorArgb and 0x00FFFFFF)
            },
            modifier =
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = TOUCH_TARGET),
        ) {
            Text(stringResource(R.string.fill_background))
        }
        Text(
            stringResource(R.string.fill_background_hint),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Text(stringResource(R.string.brush_size), style = MaterialTheme.typography.titleMedium)
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
                    contentPadding = ButtonDefaults.TextButtonContentPadding,
                    modifier =
                        Modifier
                            .weight(1f)
                            .heightIn(min = TOUCH_TARGET),
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
                contentPadding = ButtonDefaults.TextButtonContentPadding,
                modifier =
                    Modifier
                        .weight(1f)
                        .heightIn(min = TOUCH_TARGET),
            ) {
                Icon(Icons.AutoMirrored.Filled.Undo, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text(stringResource(R.string.undo))
            }

            OutlinedButton(
                onClick = onClear,
                enabled = canUndo,
                contentPadding = ButtonDefaults.TextButtonContentPadding,
                modifier =
                    Modifier
                        .weight(1f)
                        .heightIn(min = TOUCH_TARGET),
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

        if (showLaunchAction) {
            Button(
                onClick = onLaunch,
                enabled = canLaunch,
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 64.dp),
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
}

private fun labelFor(width: Float): Int =
    when (width) {
        16f -> R.string.brush_small
        48f -> R.string.brush_big
        else -> R.string.brush_medium
    }
