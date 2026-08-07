package com.kidsgalaxy.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val SpaceColorScheme = darkColorScheme(
    primary = Color(0xFF4FC3F7),
    onPrimary = Color(0xFF00344A),
    secondary = Color(0xFFFFD54F),
    onSecondary = Color(0xFF3E2F00),
    background = Color(0xFF0A0E2A),
    surface = Color(0xFF12183A),
    onBackground = Color(0xFFE8F0FF),
    onSurface = Color(0xFFE8F0FF),
    error = Color(0xFFFF6B6B)
)

@Composable
fun KidsGalaxyTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = SpaceColorScheme,
        content = content
    )
}
