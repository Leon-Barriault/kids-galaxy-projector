package com.kidsgalaxy.manager.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.kidsgalaxy.connection.GalaxyTarget
import com.kidsgalaxy.connection.UiLanguage
import com.kidsgalaxy.manager.ManagerError
import com.kidsgalaxy.manager.ManagerStatus
import com.kidsgalaxy.manager.ManagerUiState
import com.kidsgalaxy.manager.R
import com.kidsgalaxy.manager.data.PlanetDto

private val Background = Color(0xFF0A0E2A)
private val CardBg = Color(0xFF141A3A)
private val Accent = Color(0xFF4FC3F7)
private val Danger = Color(0xFFE53935)
private val TextPrimary = Color(0xFFFFFFFF)
private val TextMuted = Color(0xFFB0BEC5)

@Composable
fun ManagerScreen(
    state: ManagerUiState,
    galaxy: GalaxyTarget,
    language: UiLanguage,
    onToggleLanguage: () -> Unit,
    onProjectorLanguageChange: (String) -> Unit,
    onConfigureGalaxy: () -> Unit,
    onRefresh: () -> Unit,
    onDelete: (String) -> Unit,
    onClearAll: () -> Unit,
    onClearError: () -> Unit,
) {
    var pendingDelete by remember { mutableStateOf<PlanetDto?>(null) }
    var confirmClearAll by remember { mutableStateOf(false) }
    val languageDescription = stringResource(R.string.language_toggle_description)
    val subtitle =
        state.status?.let { managerStatusText(it) }
            ?: stringResource(R.string.planets_stored_on, galaxy.name)

    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .background(Background)
                .padding(16.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.manager_title),
                    color = TextPrimary,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = subtitle,
                    color = TextMuted,
                    fontSize = 14.sp,
                )
            }
            TextButton(
                onClick = onToggleLanguage,
                modifier = Modifier.semantics { contentDescription = languageDescription },
            ) {
                Text(
                    if (language == UiLanguage.ENGLISH) {
                        "EN ●  FR"
                    } else {
                        "EN  ● FR"
                    },
                    fontWeight = FontWeight.Bold,
                )
            }
            TextButton(onClick = onConfigureGalaxy) {
                Text(
                    text = "🌌 ${galaxy.name}",
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            IconButton(onClick = onRefresh, enabled = !state.isLoading) {
                Icon(
                    Icons.Default.Refresh,
                    contentDescription = stringResource(R.string.refresh),
                    tint = Accent,
                )
            }
        }

        Spacer(modifier = Modifier.height(10.dp))
        ProjectorLanguageControl(
            selectedLanguage = state.projectorLanguage,
            loading = state.isProjectorLanguageLoading,
            updating = state.isUpdatingProjectorLanguage,
            onSelect = onProjectorLanguageChange,
        )

        if (state.planets.isNotEmpty()) {
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedButton(
                onClick = { confirmClearAll = true },
                enabled = state.canClearAll,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Danger),
            ) {
                if (state.isClearing) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        color = Danger,
                        strokeWidth = 2.dp,
                    )
                } else {
                    Icon(Icons.Default.DeleteSweep, contentDescription = null)
                }
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    if (state.isClearing) {
                        stringResource(R.string.clearing)
                    } else {
                        stringResource(R.string.clear_all_count, state.planets.size)
                    },
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        when {
            state.isLoading && state.planets.isEmpty() -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Accent)
                }
            }

            state.planets.isEmpty() -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        stringResource(R.string.no_planets),
                        color = TextMuted,
                        fontSize = 16.sp,
                    )
                }
            }

            else -> {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    contentPadding = PaddingValues(bottom = 24.dp),
                ) {
                    items(state.planets, key = { it.id }) { planet ->
                        PlanetRow(
                            planet = planet,
                            baseUrl = galaxy.baseUrl,
                            isDeleting = planet.id in state.deletingIds,
                            onDeleteClick = { pendingDelete = planet },
                        )
                    }
                }
            }
        }
    }

    if (confirmClearAll) {
        AlertDialog(
            onDismissRequest = { confirmClearAll = false },
            title = { Text(stringResource(R.string.remove_every_planet)) },
            text = {
                Text(
                    stringResource(
                        R.string.remove_every_planet_body,
                        state.planets.size,
                        galaxy.name,
                    ),
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmClearAll = false
                        onClearAll()
                    },
                ) {
                    Text(stringResource(R.string.clear_all), color = Danger)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmClearAll = false }) {
                    Text(stringResource(R.string.keep_them))
                }
            },
        )
    }

    pendingDelete?.let { planet ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text(stringResource(R.string.remove_planet)) },
            text = {
                Text(
                    stringResource(
                        R.string.remove_planet_body,
                        planet.name,
                        galaxy.name,
                    ),
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        onDelete(planet.id)
                        pendingDelete = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Danger),
                ) {
                    Text(stringResource(R.string.remove))
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) {
                    Text(stringResource(R.string.cancel))
                }
            },
        )
    }

    state.error?.let { error ->
        AlertDialog(
            onDismissRequest = onClearError,
            title = { Text(stringResource(R.string.something_went_wrong)) },
            text = { Text(managerErrorText(error)) },
            confirmButton = {
                TextButton(onClick = onClearError) { Text("OK") }
            },
        )
    }
}

@Composable
private fun ProjectorLanguageControl(
    selectedLanguage: String,
    loading: Boolean,
    updating: Boolean,
    onSelect: (String) -> Unit,
) {
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(CardBg)
                .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.projector_language),
                    color = TextPrimary,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = stringResource(R.string.projector_language_hint),
                    color = TextMuted,
                    fontSize = 13.sp,
                )
            }
            if (loading || updating) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    color = Accent,
                    strokeWidth = 2.dp,
                )
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            LanguageChoiceButton(
                label = stringResource(R.string.projector_english),
                selected = selectedLanguage == "en",
                enabled = !loading && !updating,
                onClick = { onSelect("en") },
                modifier = Modifier.weight(1f),
            )
            LanguageChoiceButton(
                label = stringResource(R.string.projector_french),
                selected = selectedLanguage == "fr",
                enabled = !loading && !updating,
                onClick = { onSelect("fr") },
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun LanguageChoiceButton(
    label: String,
    selected: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier,
) {
    if (selected) {
        Button(
            onClick = onClick,
            enabled = enabled,
            modifier = modifier,
        ) {
            Text("✓ $label")
        }
    } else {
        OutlinedButton(
            onClick = onClick,
            enabled = enabled,
            modifier = modifier,
        ) {
            Text(label)
        }
    }
}

@Composable
private fun managerStatusText(status: ManagerStatus): String =
    when (status) {
        is ManagerStatus.Stored ->
            stringResource(R.string.status_planets_stored, status.count)

        is ManagerStatus.Removed ->
            status.name?.let { stringResource(R.string.status_removed_named, it) }
                ?: stringResource(R.string.status_planet_removed)

        is ManagerStatus.Cleared ->
            stringResource(R.string.status_cleared, status.count)

        is ManagerStatus.ProjectorLanguageChanged ->
            stringResource(
                R.string.status_projector_language_changed,
                if (status.language == "fr") {
                    stringResource(R.string.projector_french)
                } else {
                    stringResource(R.string.projector_english)
                },
            )
    }

@Composable
private fun managerErrorText(error: ManagerError): String =
    when (error) {
        is ManagerError.LoadFailed -> stringResource(R.string.error_load_failed, error.code)
        is ManagerError.DeleteFailed -> stringResource(R.string.error_delete_failed, error.code)
        is ManagerError.ClearFailed -> stringResource(R.string.error_clear_failed, error.code)
        is ManagerError.BehaviorLoadFailed ->
            stringResource(R.string.error_behavior_load_failed, error.code)
        is ManagerError.BehaviorUpdateFailed ->
            stringResource(R.string.error_behavior_update_failed, error.code)
        ManagerError.Network -> stringResource(R.string.error_network)
    }

@Composable
private fun PlanetRow(
    planet: PlanetDto,
    baseUrl: String,
    isDeleting: Boolean,
    onDeleteClick: () -> Unit,
) {
    val imageUrl =
        if (planet.url.startsWith("http")) {
            planet.url
        } else {
            baseUrl.trimEnd('/') + planet.url
        }
    val shape = stringResource(shapeLabelResource(planet.style))

    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(CardBg)
                .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AsyncImage(
            model = imageUrl,
            contentDescription = planet.name,
            contentScale = ContentScale.Crop,
            modifier =
                Modifier
                    .size(72.dp)
                    .clip(CircleShape)
                    .background(Color(0xFF1E2748)),
        )
        Spacer(modifier = Modifier.width(14.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = planet.name,
                color = TextPrimary,
                fontSize = 18.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = stringResource(R.string.planet_shape, shape),
                color = Accent,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
            )
            Text(
                text = stringResource(R.string.planet_id, planet.id),
                color = TextMuted,
                fontSize = 12.sp,
                style = MaterialTheme.typography.bodySmall,
            )
        }
        if (isDeleting) {
            CircularProgressIndicator(
                modifier = Modifier.size(28.dp),
                color = Accent,
                strokeWidth = 2.dp,
            )
        } else {
            IconButton(onClick = onDeleteClick) {
                Icon(
                    Icons.Default.Delete,
                    contentDescription = stringResource(R.string.remove_named, planet.name),
                    tint = Danger,
                )
            }
        }
    }
}

private fun shapeLabelResource(style: String): Int =
    when (style.lowercase()) {
        "ringed" -> R.string.shape_ringed
        "cratered" -> R.string.shape_cratered
        "spiky" -> R.string.shape_spiky
        else -> R.string.shape_classic
    }
