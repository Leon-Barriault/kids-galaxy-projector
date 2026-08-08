package com.kidsgalaxy.manager.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.kidsgalaxy.connection.AndroidGalaxyDiscovery
import com.kidsgalaxy.connection.GalaxyTarget

@Composable
fun GalaxyPickerDialog(
    current: GalaxyTarget,
    fallbackScheme: String,
    onSelect: (GalaxyTarget) -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val discovery =
        remember(context, fallbackScheme) {
            AndroidGalaxyDiscovery(context, fallbackScheme)
        }
    var targets by remember { mutableStateOf(emptyList<GalaxyTarget>()) }
    var discoveryError by remember { mutableStateOf<String?>(null) }
    var manualAddress by remember { mutableStateOf("") }
    var manualError by remember { mutableStateOf<String?>(null) }

    DisposableEffect(discovery) {
        discovery.start(
            object : AndroidGalaxyDiscovery.Listener {
                override fun onTargetsChanged(targetsFound: List<GalaxyTarget>) {
                    targets = targetsFound
                    discoveryError = null
                }

                override fun onError(message: String) {
                    discoveryError = message
                }
            },
        )
        onDispose { discovery.stop() }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Choose managed galaxy") },
        text = {
            Column(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .heightIn(max = 460.dp)
                        .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text("Current: ${current.name}")
                if (targets.isEmpty()) {
                    Text(discoveryError ?: "Searching the local network…")
                } else {
                    Text("Nearby galaxies")
                    targets.forEach { target ->
                        OutlinedButton(
                            onClick = { onSelect(target) },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text("${target.name}  •  ${target.baseUrl}")
                        }
                    }
                }

                Text("Or enter an address")
                OutlinedTextField(
                    value = manualAddress,
                    onValueChange = {
                        manualAddress = it
                        manualError = null
                    },
                    placeholder = { Text("10.42.0.1:8000") },
                    singleLine = true,
                    isError = manualError != null,
                    supportingText = manualError?.let { message -> { Text(message) } },
                    modifier = Modifier.fillMaxWidth(),
                )
                Button(
                    onClick = {
                        try {
                            onSelect(
                                GalaxyTarget.fromManual(
                                    rawAddress = manualAddress,
                                    defaultScheme = fallbackScheme,
                                    name = "Manual Galaxy",
                                ),
                            )
                        } catch (error: IllegalArgumentException) {
                            manualError = error.message ?: "Invalid galaxy address"
                        }
                    },
                    enabled = manualAddress.isNotBlank(),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Manage this address")
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}
