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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.kidsgalaxy.R
import com.kidsgalaxy.di.ServiceLocator
import com.kidsgalaxy.presentation.DrawingViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlanetDrawerScreen(
    // Obtained through the factory so the ViewModel is properly scoped and
    // survives configuration changes.
    viewModel: DrawingViewModel =
        viewModel(factory = ServiceLocator.viewModelFactory(LocalContext.current)),
) {
    val state by viewModel.uiState.collectAsState()
    // rememberSaveable so the typed name survives process-level recreation.
    var planetName by rememberSaveable { mutableStateOf("") }
    val defaultName = stringResource(R.string.default_planet_name)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.screen_title)) },
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
                label = { Text(stringResource(R.string.name_your_planet)) },
                placeholder = { Text(stringResource(R.string.name_placeholder)) },
                singleLine = true,
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
            )

            val canvasDescription = stringResource(R.string.drawing_canvas_description)
            DrawingCanvas(
                strokes = state.drawing.strokes,
                currentColorArgb = state.currentColorArgb,
                currentStrokeWidth = state.currentStrokeWidth,
                onStartStroke = viewModel::startStroke,
                onContinueStroke = viewModel::continueStroke,
                onEndStroke = viewModel::endStroke,
                onCanvasSizeChanged = viewModel::onCanvasSizeChanged,
                modifier =
                    Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp)
                        .semantics { contentDescription = canvasDescription },
            )

            DrawingControls(
                selectedColorArgb = state.currentColorArgb,
                onColorChange = viewModel::changeColor,
                strokeWidth = state.currentStrokeWidth,
                onStrokeWidthChange = viewModel::changeStrokeWidth,
                isSending = state.isSending,
                canLaunch = state.canLaunch,
                canUndo = state.canUndo,
                onUndo = viewModel::undo,
                onClear = viewModel::clear,
                onLaunch = {
                    viewModel.sendPlanet(planetName.ifBlank { defaultName })
                },
            )
        }
    }

    // Error dialog - dismissible via the button, a tap outside, or the back gesture.
    state.errorMessage?.let { error ->
        AlertDialog(
            onDismissRequest = viewModel::clearError,
            title = { Text(stringResource(R.string.oops)) },
            text = { Text(error) },
            confirmButton = {
                TextButton(onClick = viewModel::clearError) {
                    Text(stringResource(R.string.ok))
                }
            },
        )
    }

    if (state.showSuccess) {
        AlertDialog(
            onDismissRequest = viewModel::dismissSuccess,
            title = { Text(stringResource(R.string.launched_title)) },
            text = { Text(stringResource(R.string.launched_body)) },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.startNewPlanet()
                        planetName = ""
                    },
                ) {
                    Text(stringResource(R.string.awesome))
                }
            },
        )
    }
}
