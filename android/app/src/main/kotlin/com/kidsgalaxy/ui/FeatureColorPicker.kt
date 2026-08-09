package com.kidsgalaxy.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.kidsgalaxy.domain.model.DEFAULT_CRATER_COLOR_ARGB
import com.kidsgalaxy.domain.model.DEFAULT_MOUNTAIN_COLOR_ARGB
import com.kidsgalaxy.domain.model.DEFAULT_RING_COLOR_ARGB

internal val RING_FEATURE_COLORS =
    listOf(
        DEFAULT_RING_COLOR_ARGB,
        0xFFFFC107.toInt(),
        0xFF4FC3F7.toInt(),
        0xFFFF7043.toInt(),
        0xFF66BB6A.toInt(),
        0xFFFFFFFF.toInt(),
    )

internal val CRATER_FEATURE_COLORS =
    listOf(
        DEFAULT_CRATER_COLOR_ARGB,
        0xFF4FC3F7.toInt(),
        0xFFAB47BC.toInt(),
        0xFFFF7043.toInt(),
        0xFF66BB6A.toInt(),
        0xFFFFFFFF.toInt(),
    )

internal val MOUNTAIN_FEATURE_COLORS =
    listOf(
        DEFAULT_MOUNTAIN_COLOR_ARGB,
        0xFF66BB6A.toInt(),
        0xFFFF7043.toInt(),
        0xFFFFC107.toInt(),
        0xFFAB47BC.toInt(),
        0xFFFFFFFF.toInt(),
    )

@Composable
internal fun FeatureColorPicker(
    title: String,
    hint: String,
    colors: List<Int>,
    selectedColorArgb: Int,
    onColorChange: (Int) -> Unit,
) {
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(
            title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )
        Text(
            hint,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            colors.forEach { colorArgb ->
                val selected = colorArgb == selectedColorArgb
                Box(
                    modifier =
                        Modifier
                            .size(if (selected) 52.dp else 46.dp)
                            .background(Color(colorArgb), CircleShape)
                            .border(
                                width = if (selected) 4.dp else 2.dp,
                                color =
                                    if (selected) {
                                        MaterialTheme.colorScheme.primary
                                    } else {
                                        MaterialTheme.colorScheme.outline
                                    },
                                shape = CircleShape,
                            ).selectable(
                                selected = selected,
                                role = Role.RadioButton,
                                onClick = { onColorChange(colorArgb) },
                            ),
                )
            }
        }
    }
}
