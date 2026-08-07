package com.kidsgalaxy.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.kidsgalaxy.viewmodel.DrawingViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlanetDrawerScreen(
    viewModel: DrawingViewModel = viewModel()
) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    var planetName by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Draw Your Planet 🌍") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
        ) {
            OutlinedTextField(
                value = planetName,
                onValueChange = { planetName = it },
                label = { Text("Name your planet") },
                placeholder = { Text("e.g. Sparkle World") },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp)
            )

            DrawingCanvas(
                strokes = state.strokes,
                currentColor = state.currentColor,
                currentStrokeWidth = state.currentStrokeWidth,
                onStartStroke = viewModel::startStroke,
                onContinueStroke = viewModel::continueStroke,
                onEndStroke = viewModel::endStroke,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
            )

            DrawingControls(
                selectedColor = state.currentColor,
                onColorChange = viewModel::changeColor,
                strokeWidth = state.currentStrokeWidth,
                onStrokeWidthChange = viewModel::changeStrokeWidth,
                isSending = state.isSending,
                onUndo = viewModel::undo,
                onClear = viewModel::clear,
                onLaunch = {
                    viewModel.sendPlanet(context, planetName.ifBlank { "My Awesome Planet" })
                }
            )
        }
    }

    // Error snackbar
    state.lastError?.let { error ->
        AlertDialog(
            onDismissRequest = { /* keep until user dismisses via another action */ },
            title = { Text("Oops!") },
            text = { Text(error) },
            confirmButton = {
                TextButton(onClick = { /* error is cleared on next send */ }) {
                    Text("OK")
                }
            }
        )
    }

    // Success celebration
    if (state.showSuccess) {
        AlertDialog(
            onDismissRequest = { viewModel.dismissSuccess() },
            title = { Text("🚀 Planet Launched!") },
            text = {
                Text("Your planet is now flying through the galaxy!\nLook at the projector!")
            },
            confirmButton = {
                Button(onClick = { viewModel.dismissSuccess() }) {
                    Text("Awesome!")
                }
            }
        )
    }
}
