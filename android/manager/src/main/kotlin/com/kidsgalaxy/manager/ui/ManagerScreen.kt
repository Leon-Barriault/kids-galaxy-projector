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
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.kidsgalaxy.manager.BuildConfig
import com.kidsgalaxy.manager.ManagerUiState
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
    onRefresh: () -> Unit,
    onDelete: (String) -> Unit,
    onClearError: () -> Unit,
) {
    var pendingDelete by remember { mutableStateOf<PlanetDto?>(null) }

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
                    text = "Kids Galaxy Manager",
                    color = TextPrimary,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = state.statusMessage ?: "Planets stored on the server",
                    color = TextMuted,
                    fontSize = 14.sp,
                )
            }
            IconButton(onClick = onRefresh, enabled = !state.isLoading) {
                Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = Accent)
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
                    Text("No planets yet \u2014 kids can start drawing!", color = TextMuted, fontSize = 16.sp)
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
                            isDeleting = planet.id in state.deletingIds,
                            onDeleteClick = { pendingDelete = planet },
                        )
                    }
                }
            }
        }
    }

    pendingDelete?.let { planet ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("Remove planet?") },
            text = {
                Text(
                    "\"${planet.name}\" will leave the galaxy and be deleted from the server. This cannot be undone.",
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
                    Text("Remove")
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) {
                    Text("Cancel")
                }
            },
        )
    }

    state.errorMessage?.let { message ->
        AlertDialog(
            onDismissRequest = onClearError,
            title = { Text("Something went wrong") },
            text = { Text(message) },
            confirmButton = {
                TextButton(onClick = onClearError) { Text("OK") }
            },
        )
    }
}

@Composable
private fun PlanetRow(
    planet: PlanetDto,
    isDeleting: Boolean,
    onDeleteClick: () -> Unit,
) {
    val imageUrl =
        if (planet.url.startsWith("http")) {
            planet.url
        } else {
            BuildConfig.SERVER_BASE_URL.trimEnd('/') + planet.url
        }

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
                text = "id ${planet.id}",
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
                Icon(Icons.Default.Delete, contentDescription = "Remove ${planet.name}", tint = Danger)
            }
        }
    }
}
