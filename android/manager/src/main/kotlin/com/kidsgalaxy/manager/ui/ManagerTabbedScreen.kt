package com.kidsgalaxy.manager.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import com.kidsgalaxy.connection.GalaxyTarget
import com.kidsgalaxy.connection.UiLanguage
import com.kidsgalaxy.manager.ManagerUiState
import com.kidsgalaxy.manager.R
import com.kidsgalaxy.manager.data.PlanetDto

private val TabsBackground = Color(0xFF0A0E2A)

@Composable
fun ManagerTabbedScreen(
    state: ManagerUiState,
    galaxy: GalaxyTarget,
    language: UiLanguage,
    onToggleLanguage: () -> Unit,
    onProjectorLanguageChange: (String) -> Unit,
    onConfigureGalaxy: () -> Unit,
    onRefresh: () -> Unit,
    onDelete: (String) -> Unit,
    onPrintPlanet: (PlanetDto) -> Unit,
    onExportPlanetStl: (PlanetDto) -> Unit,
    onClearAll: () -> Unit,
    onClearError: () -> Unit,
    onAsteroidBeltChange: (Boolean) -> Unit,
    onCometsChange: (Boolean) -> Unit,
    onCometFrequencyChange: (String) -> Unit,
    onFlybyAsteroidsChange: (Boolean) -> Unit,
    onFlybyFrequencyChange: (String) -> Unit,
    onBehaviorModeChange: (String) -> Unit,
    onManualThemeChange: (String) -> Unit,
    onThemeEnabledChange: (String, Boolean) -> Unit,
    onAmbientEffectsChange: (Boolean) -> Unit,
) {
    var selectedTab by remember { mutableIntStateOf(0) }

    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .background(TabsBackground),
    ) {
        TabRow(selectedTabIndex = selectedTab, containerColor = TabsBackground) {
            Tab(
                selected = selectedTab == 0,
                onClick = { selectedTab = 0 },
                text = { Text(stringResource(R.string.tab_planets)) },
            )
            Tab(
                selected = selectedTab == 1,
                onClick = { selectedTab = 1 },
                text = { Text(stringResource(R.string.tab_galaxy)) },
            )
        }

        if (selectedTab == 0) {
            ManagerScreen(
                state = state,
                galaxy = galaxy,
                language = language,
                onToggleLanguage = onToggleLanguage,
                onProjectorLanguageChange = onProjectorLanguageChange,
                onConfigureGalaxy = onConfigureGalaxy,
                onRefresh = onRefresh,
                onDelete = onDelete,
                onPrintPlanet = onPrintPlanet,
                onExportPlanetStl = onExportPlanetStl,
                onClearAll = onClearAll,
                onClearError = onClearError,
            )
        } else {
            GalaxyAdminScreen(
                state = state,
                galaxy = galaxy,
                language = language,
                onToggleLanguage = onToggleLanguage,
                onConfigureGalaxy = onConfigureGalaxy,
                onRefresh = onRefresh,
                onAsteroidBeltChange = onAsteroidBeltChange,
                onCometsChange = onCometsChange,
                onCometFrequencyChange = onCometFrequencyChange,
                onFlybyAsteroidsChange = onFlybyAsteroidsChange,
                onFlybyFrequencyChange = onFlybyFrequencyChange,
                onBehaviorModeChange = onBehaviorModeChange,
                onManualThemeChange = onManualThemeChange,
                onThemeEnabledChange = onThemeEnabledChange,
                onAmbientEffectsChange = onAmbientEffectsChange,
            )
        }
    }
}
