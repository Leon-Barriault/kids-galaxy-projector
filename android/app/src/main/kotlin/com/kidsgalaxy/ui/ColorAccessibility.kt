package com.kidsgalaxy.ui

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.kidsgalaxy.R
import com.kidsgalaxy.domain.model.DEFAULT_CRATER_COLOR_ARGB
import com.kidsgalaxy.domain.model.DEFAULT_MOUNTAIN_COLOR_ARGB
import com.kidsgalaxy.domain.model.DEFAULT_RING_COLOR_ARGB

@Composable
internal fun colorContentDescription(colorArgb: Int): String =
    stringResource(colorNameResource(colorArgb))

@StringRes
internal fun colorNameResource(colorArgb: Int): Int =
    when (colorArgb) {
        0xFFE53935.toInt() -> R.string.color_red
        0xFFFF9800.toInt() -> R.string.color_orange
        0xFFFFEB3B.toInt() -> R.string.color_yellow
        0xFF4CAF50.toInt() -> R.string.color_green
        0xFF2196F3.toInt() -> R.string.color_blue
        0xFF9C27B0.toInt(), 0xFFAB47BC.toInt() -> R.string.color_purple
        0xFFE91E63.toInt() -> R.string.color_pink
        0xFF000000.toInt() -> R.string.color_black
        0xFFFFFFFF.toInt() -> R.string.color_white
        DEFAULT_RING_COLOR_ARGB -> R.string.color_lavender
        DEFAULT_CRATER_COLOR_ARGB -> R.string.color_gray
        DEFAULT_MOUNTAIN_COLOR_ARGB -> R.string.color_brown
        0xFFFFC107.toInt() -> R.string.color_gold
        0xFF4FC3F7.toInt() -> R.string.color_sky_blue
        0xFFFF7043.toInt() -> R.string.color_coral
        0xFF66BB6A.toInt() -> R.string.color_light_green
        else -> R.string.color_custom
    }
