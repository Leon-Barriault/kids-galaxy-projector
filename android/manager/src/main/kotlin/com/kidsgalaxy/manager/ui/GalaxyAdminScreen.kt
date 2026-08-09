package com.kidsgalaxy.manager.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kidsgalaxy.connection.GalaxyTarget
import com.kidsgalaxy.connection.UiLanguage
import com.kidsgalaxy.manager.ManagerUiState
import com.kidsgalaxy.manager.R
import com.kidsgalaxy.manager.data.BehaviorSettingsDto

private val AdminBackground = Color(0xFF0A0E2A)
private val AdminCard = Color(0xFF141A3A)
private val AdminAccent = Color(0xFF4FC3F7)
private val AdminText = Color.White
private val AdminMuted = Color(0xFFB0BEC5)

@Composable
fun GalaxyAdminScreen(
    state: ManagerUiState,
    galaxy: GalaxyTarget,
    language: UiLanguage,
    onToggleLanguage: () -> Unit,
    onConfigureGalaxy: () -> Unit,
    onRefresh: () -> Unit,
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
    val settings = state.behaviorSettings
    LazyColumn(
        modifier =
            Modifier
                .fillMaxSize()
                .background(AdminBackground)
                .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            AdminHeader(
                galaxy = galaxy,
                language = language,
                loading = state.isBehaviorLoading || state.isUpdatingBehavior,
                onToggleLanguage = onToggleLanguage,
                onConfigureGalaxy = onConfigureGalaxy,
                onRefresh = onRefresh,
            )
        }
        item {
            EnvironmentCard(
                settings = settings,
                enabled = !state.isBehaviorLoading && !state.isUpdatingBehavior,
                onAsteroidBeltChange = onAsteroidBeltChange,
                onCometsChange = onCometsChange,
                onCometFrequencyChange = onCometFrequencyChange,
                onFlybyAsteroidsChange = onFlybyAsteroidsChange,
                onFlybyFrequencyChange = onFlybyFrequencyChange,
            )
        }
        item {
            ThemeCard(
                settings = settings,
                enabled = !state.isBehaviorLoading && !state.isUpdatingBehavior,
                onBehaviorModeChange = onBehaviorModeChange,
                onManualThemeChange = onManualThemeChange,
                onThemeEnabledChange = onThemeEnabledChange,
                onAmbientEffectsChange = onAmbientEffectsChange,
            )
        }
        item { Spacer(modifier = Modifier.height(24.dp)) }
    }
}

@Composable
private fun AdminHeader(
    galaxy: GalaxyTarget,
    language: UiLanguage,
    loading: Boolean,
    onToggleLanguage: () -> Unit,
    onConfigureGalaxy: () -> Unit,
    onRefresh: () -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(top = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = stringResource(R.string.galaxy_controls_title),
                color = AdminText,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = stringResource(R.string.galaxy_controls_subtitle, galaxy.name),
                color = AdminMuted,
                fontSize = 14.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (loading) {
            CircularProgressIndicator(
                modifier = Modifier.size(20.dp),
                color = AdminAccent,
                strokeWidth = 2.dp,
            )
        }
        TextButton(onClick = onToggleLanguage) {
            Text(
                if (language == UiLanguage.ENGLISH) "EN ●  FR" else "EN  ● FR",
                fontWeight = FontWeight.Bold,
            )
        }
        TextButton(onClick = onConfigureGalaxy) {
            Text("🌌")
        }
        TextButton(onClick = onRefresh) {
            Text(stringResource(R.string.refresh))
        }
    }
}

@Composable
private fun EnvironmentCard(
    settings: BehaviorSettingsDto,
    enabled: Boolean,
    onAsteroidBeltChange: (Boolean) -> Unit,
    onCometsChange: (Boolean) -> Unit,
    onCometFrequencyChange: (String) -> Unit,
    onFlybyAsteroidsChange: (Boolean) -> Unit,
    onFlybyFrequencyChange: (String) -> Unit,
) {
    SettingsCard(
        title = stringResource(R.string.space_activity),
        subtitle = stringResource(R.string.space_activity_hint),
    ) {
        ToggleSetting(
            title = stringResource(R.string.asteroid_belt),
            subtitle = stringResource(R.string.asteroid_belt_hint),
            checked = settings.asteroidBeltEnabled,
            enabled = enabled,
            onCheckedChange = onAsteroidBeltChange,
        )
        ToggleSetting(
            title = stringResource(R.string.comets),
            subtitle = stringResource(R.string.comets_hint),
            checked = settings.cometsEnabled,
            enabled = enabled,
            onCheckedChange = onCometsChange,
        )
        if (settings.cometsEnabled) {
            FrequencySelector(
                selected = settings.cometFrequency,
                enabled = enabled,
                onSelect = onCometFrequencyChange,
            )
        }
        ToggleSetting(
            title = stringResource(R.string.flyby_asteroids),
            subtitle = stringResource(R.string.flyby_asteroids_hint),
            checked = settings.flybyAsteroidsEnabled,
            enabled = enabled,
            onCheckedChange = onFlybyAsteroidsChange,
        )
        if (settings.flybyAsteroidsEnabled) {
            FrequencySelector(
                selected = settings.flybyFrequency,
                enabled = enabled,
                onSelect = onFlybyFrequencyChange,
            )
        }
    }
}

@Composable
private fun ThemeCard(
    settings: BehaviorSettingsDto,
    enabled: Boolean,
    onBehaviorModeChange: (String) -> Unit,
    onManualThemeChange: (String) -> Unit,
    onThemeEnabledChange: (String, Boolean) -> Unit,
    onAmbientEffectsChange: (Boolean) -> Unit,
) {
    SettingsCard(
        title = stringResource(R.string.themes),
        subtitle = stringResource(R.string.themes_hint),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ChoiceButton(
                selected = settings.mode == "auto",
                enabled = enabled,
                label = stringResource(R.string.theme_auto),
                onClick = { onBehaviorModeChange("auto") },
            )
            ChoiceButton(
                selected = settings.mode == "manual",
                enabled = enabled,
                label = stringResource(R.string.theme_manual),
                onClick = { onBehaviorModeChange("manual") },
            )
        }

        if (settings.mode == "manual") {
            Text(
                text = stringResource(R.string.manual_theme),
                color = AdminMuted,
                fontSize = 13.sp,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                ThemeChoice(
                    "default",
                    R.string.theme_default,
                    settings,
                    enabled,
                    onManualThemeChange,
                )
                ThemeChoice(
                    "halloween",
                    R.string.theme_halloween,
                    settings,
                    enabled,
                    onManualThemeChange,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                ThemeChoice(
                    "easter",
                    R.string.theme_easter,
                    settings,
                    enabled,
                    onManualThemeChange,
                )
                ThemeChoice(
                    "christmas",
                    R.string.theme_christmas,
                    settings,
                    enabled,
                    onManualThemeChange,
                )
            }
        }

        Text(
            text = stringResource(R.string.enabled_seasonal_themes),
            color = AdminMuted,
            fontSize = 13.sp,
        )
        ThemeToggle(
            theme = "halloween",
            label = stringResource(R.string.theme_halloween),
            settings = settings,
            enabled = enabled,
            onThemeEnabledChange = onThemeEnabledChange,
        )
        ThemeToggle(
            theme = "easter",
            label = stringResource(R.string.theme_easter),
            settings = settings,
            enabled = enabled,
            onThemeEnabledChange = onThemeEnabledChange,
        )
        ThemeToggle(
            theme = "christmas",
            label = stringResource(R.string.theme_christmas),
            settings = settings,
            enabled = enabled,
            onThemeEnabledChange = onThemeEnabledChange,
        )
        ToggleSetting(
            title = stringResource(R.string.ambient_theme_effects),
            subtitle = stringResource(R.string.ambient_theme_effects_hint),
            checked = settings.ambientEffects,
            enabled = enabled,
            onCheckedChange = onAmbientEffectsChange,
        )
    }
}

@Composable
private fun SettingsCard(
    title: String,
    subtitle: String,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(AdminCard)
                .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = title,
            color = AdminText,
            fontWeight = FontWeight.Bold,
            fontSize = 18.sp,
        )
        Text(
            text = subtitle,
            color = AdminMuted,
            fontSize = 13.sp,
        )
        content()
    }
}

@Composable
private fun ToggleSetting(
    title: String,
    subtitle: String,
    checked: Boolean,
    enabled: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, color = AdminText, fontWeight = FontWeight.SemiBold)
            Text(subtitle, color = AdminMuted, fontSize = 12.sp)
        }
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            enabled = enabled,
        )
    }
}

@Composable
private fun FrequencySelector(
    selected: String,
    enabled: Boolean,
    onSelect: (String) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        FrequencyButton("rare", R.string.frequency_rare, selected, enabled, onSelect)
        FrequencyButton("normal", R.string.frequency_normal, selected, enabled, onSelect)
        FrequencyButton("frequent", R.string.frequency_frequent, selected, enabled, onSelect)
    }
}

@Composable
private fun FrequencyButton(
    value: String,
    labelResource: Int,
    selected: String,
    enabled: Boolean,
    onSelect: (String) -> Unit,
) {
    ChoiceButton(
        selected = selected == value,
        enabled = enabled,
        label = stringResource(labelResource),
        onClick = { onSelect(value) },
    )
}

@Composable
private fun ThemeChoice(
    theme: String,
    labelResource: Int,
    settings: BehaviorSettingsDto,
    enabled: Boolean,
    onSelect: (String) -> Unit,
) {
    ChoiceButton(
        selected = settings.manualTheme == theme,
        enabled = enabled && (theme == "default" || theme in settings.enabledThemes),
        label = stringResource(labelResource),
        onClick = { onSelect(theme) },
    )
}

@Composable
private fun ThemeToggle(
    theme: String,
    label: String,
    settings: BehaviorSettingsDto,
    enabled: Boolean,
    onThemeEnabledChange: (String, Boolean) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, color = AdminText, modifier = Modifier.weight(1f))
        Switch(
            checked = theme in settings.enabledThemes,
            onCheckedChange = { onThemeEnabledChange(theme, it) },
            enabled = enabled,
        )
    }
}

@Composable
private fun ChoiceButton(
    selected: Boolean,
    enabled: Boolean,
    label: String,
    onClick: () -> Unit,
) {
    if (selected) {
        Button(
            onClick = onClick,
            enabled = enabled,
            colors = ButtonDefaults.buttonColors(containerColor = AdminAccent),
        ) {
            Text(label)
        }
    } else {
        OutlinedButton(onClick = onClick, enabled = enabled) {
            Text(label)
        }
    }
}
