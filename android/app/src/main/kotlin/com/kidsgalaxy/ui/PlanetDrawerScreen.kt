package com.kidsgalaxy.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.kidsgalaxy.viewmodel.DrawingViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlanetDrawerScreen(viewModel: DrawingViewModel = viewModel()) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    var planetName by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Draw Your Planet \ud83c\udf0d") },
                colors =
                    TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.surface,
                    ),
            )
        },
    ) { padding ->
        Column(
            modifier =
                Modifier
                    .padding(padding)
                    .fillMaxSize(),
        ) {
            OutlinedTextField(
                value = planetName,
                onValueChange = { planetName = it },
                label = { Text("Name your planet") },
                placeholder = { Text("e.g. Sparkle World") },
                singleLine = true,
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
            )

            DrawingCanvas(
                strokes = state.strokes,
                currentColor = state.currentColor,
                currentStrokeWidth = state.currentStrokeWidth,
                onStartStroke = viewModel::startStroke,
                onContinueStroke = viewModel::continueStroke,
                onEndStroke = viewModel::endStroke,
                modifier =
                    Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
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
                },
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
            },
        )
    }

    // Success celebration
    if (state.showSuccess) {
        AlertDialog(
            onDismissRequest = { viewModel.dismissSuccess() },
            title = { Text("\ud83d\ude80 Planet Launched!") },
            text = {
                Text("Your planet is now flying through the galaxy!\nLook at the projector!")
            },
            confirmButton = {
                Button(onClick = { viewModel.dismissSuccess() }) {
                    Text("Awesome!")
                }
            },
        )
    }
}
