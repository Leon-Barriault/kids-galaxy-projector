package com.kidsgalaxy.ui

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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.kidsgalaxy.connection.AndroidGalaxyDiscovery
import com.kidsgalaxy.connection.GalaxyTarget
import com.kidsgalaxy.connection.GalaxyTargetVerifier
import com.kidsgalaxy.data.remote.ApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private enum class GalaxyHealth {
    CHECKING,
    REACHABLE,
    UNREACHABLE,
}

/** Volunteer-facing selection of the Pi/projector this tablet sends planets to. */
@Composable
fun GalaxyPickerDialog(
    current: GalaxyTarget,
    fallbackScheme: String,
    onSelect: (GalaxyTarget) -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val discovery =
        remember(context, fallbackScheme) {
            AndroidGalaxyDiscovery(context, fallbackScheme)
        }
    val verifier =
        remember(context) {
            GalaxyTargetVerifier(ApiClient.httpClient(context.applicationContext))
        }
    var targets by remember { mutableStateOf(emptyList<GalaxyTarget>()) }
    var healthByUrl by remember { mutableStateOf<Map<String, GalaxyHealth>>(emptyMap()) }
    var discoveryError by remember { mutableStateOf<String?>(null) }
    var selectingUrl by remember { mutableStateOf<String?>(null) }
    var manualAddress by remember { mutableStateOf("") }
    var manualError by remember { mutableStateOf<String?>(null) }
    var checkingManual by remember { mutableStateOf(false) }

    fun checkDiscovered(target: GalaxyTarget) {
        if (healthByUrl[target.baseUrl] != null) return
        healthByUrl = healthByUrl + (target.baseUrl to GalaxyHealth.CHECKING)
        scope.launch {
            val result = withContext(Dispatchers.IO) { verifier.verify(target) }
            healthByUrl =
                healthByUrl +
                    (
                        target.baseUrl to
                            if (result.reachable) {
                                GalaxyHealth.REACHABLE
                            } else {
                                GalaxyHealth.UNREACHABLE
                            }
                    )
        }
    }

    fun selectWhenVerified(target: GalaxyTarget) {
        if (selectingUrl != null) return
        selectingUrl = target.baseUrl
        healthByUrl = healthByUrl + (target.baseUrl to GalaxyHealth.CHECKING)
        scope.launch {
            val result = withContext(Dispatchers.IO) { verifier.verify(target) }
            healthByUrl =
                healthByUrl +
                    (
                        target.baseUrl to
                            if (result.reachable) {
                                GalaxyHealth.REACHABLE
                            } else {
                                GalaxyHealth.UNREACHABLE
                            }
                    )
            selectingUrl = null
            if (result.reachable) {
                onSelect(target)
            } else {
                discoveryError = result.message ?: "Galaxy could not be reached"
            }
        }
    }

    DisposableEffect(discovery) {
        discovery.start(
            object : AndroidGalaxyDiscovery.Listener {
                override fun onTargetsChanged(targetsFound: List<GalaxyTarget>) {
                    targets = targetsFound
                    val liveUrls = targetsFound.mapTo(mutableSetOf()) { it.baseUrl }
                    healthByUrl = healthByUrl.filterKeys { it in liveUrls }
                    targetsFound.forEach(::checkDiscovered)
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
        title = { Text("Choose a galaxy") },
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
                        val health = healthByUrl[target.baseUrl] ?: GalaxyHealth.CHECKING
                        val healthText =
                            when (health) {
                                GalaxyHealth.CHECKING -> "Checking…"
                                GalaxyHealth.REACHABLE -> "✓ Reachable"
                                GalaxyHealth.UNREACHABLE -> "⚠ Unreachable — tap to retry"
                            }
                        OutlinedButton(
                            onClick = { selectWhenVerified(target) },
                            enabled = selectingUrl == null && health != GalaxyHealth.CHECKING,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text("${target.name}  •  $healthText\n${target.baseUrl}")
                        }
                    }
                    discoveryError?.let { Text(it) }
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
                        val target =
                            try {
                                GalaxyTarget.fromManual(
                                    rawAddress = manualAddress,
                                    defaultScheme = fallbackScheme,
                                )
                            } catch (error: IllegalArgumentException) {
                                manualError = error.message ?: "Invalid galaxy address"
                                return@Button
                            }

                        checkingManual = true
                        manualError = null
                        scope.launch {
                            val result = withContext(Dispatchers.IO) { verifier.verify(target) }
                            checkingManual = false
                            if (result.reachable) {
                                onSelect(target)
                            } else {
                                manualError = result.message ?: "Galaxy could not be reached"
                            }
                        }
                    },
                    enabled = manualAddress.isNotBlank() && !checkingManual,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (checkingManual) "Verifying…" else "Use this address")
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}
