package com.kidsgalaxy.ui

import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.kidsgalaxy.R
import com.kidsgalaxy.connection.GalaxyTarget
import com.kidsgalaxy.di.ServiceLocator
import com.kidsgalaxy.presentation.DrawingViewModel

/** Width reserved for the controls when they sit beside the canvas. */
private val SIDE_PANEL_WIDTH = 340.dp

/** The drawing surface never shrinks below this, however cramped the screen. */
private val MIN_CANVAS_HEIGHT = 220.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlanetDrawerScreen(
    galaxy: GalaxyTarget,
    onConfigureGalaxy: () -> Unit,
    // The target is part of the key. Changing galaxies replaces the outer
    // network graph instead of mutating an in-flight repository under a VM.
    viewModel: DrawingViewModel =
        viewModel(
            key = "drawing:${galaxy.baseUrl}",
            factory =
                ServiceLocator.viewModelFactory(
                    LocalContext.current,
                    galaxy.baseUrl,
                ),
        ),
) {
    val state by viewModel.uiState.collectAsState()
    // rememberSaveable so the typed name survives rotation and process death.
    var planetName by rememberSaveable { mutableStateOf("") }
    val defaultName = stringResource(R.string.default_planet_name)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.screen_title)) },
                actions = {
                    TextButton(onClick = onConfigureGalaxy) {
                        Text(
                            text = "🌌 ${galaxy.name}",
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                },
                colors =
                    TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.surface,
                    ),
            )
        },
    ) { padding ->
        BoxWithConstraints(
            modifier =
                Modifier
                    .padding(padding)
                    .fillMaxSize(),
        ) {
            // On a small tablet in landscape the vertical space is the scarce
            // resource, so the controls move beside the canvas rather than
            // stacking below it and squeezing the drawing area to nothing.
            val sideBySide = maxWidth > maxHeight && maxWidth >= 600.dp

            val nameField: @Composable (Modifier) -> Unit = { fieldModifier ->
                OutlinedTextField(
                    value = planetName,
                    onValueChange = { planetName = it },
                    label = { Text(stringResource(R.string.name_your_planet)) },
                    placeholder = { Text(stringResource(R.string.name_placeholder)) },
                    singleLine = true,
                    modifier = fieldModifier,
                )
            }

            val canvasDescription = stringResource(R.string.drawing_canvas_description)
            val canvas: @Composable (Modifier) -> Unit = { canvasModifier ->
                DrawingCanvas(
                    strokes = state.drawing.strokes,
                    currentColorArgb = state.currentColorArgb,
                    currentStrokeWidth = state.currentStrokeWidth,
                    onStartStroke = viewModel::startStroke,
                    onContinueStroke = viewModel::continueStroke,
                    onEndStroke = viewModel::endStroke,
                    onCanvasSizeChanged = viewModel::onCanvasSizeChanged,
                    modifier = canvasModifier.semantics { contentDescription = canvasDescription },
                )
            }

            val controls: @Composable (Modifier) -> Unit = { controlsModifier ->
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
                    onLaunch = { viewModel.sendPlanet(planetName.ifBlank { defaultName }) },
                    modifier = controlsModifier,
                )
            }

            if (sideBySide) {
                Row(modifier = Modifier.fillMaxSize()) {
                    canvas(
                        Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .padding(start = 16.dp, top = 8.dp, bottom = 16.dp, end = 8.dp),
                    )
                    // Scrollable so the panel still works on a short screen.
                    Column(
                        modifier =
                            Modifier
                                .width(SIDE_PANEL_WIDTH)
                                .fillMaxHeight()
                                .verticalScroll(rememberScrollState()),
                    ) {
                        nameField(
                            Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 8.dp),
                        )
                        controls(Modifier)
                    }
                }
            } else {
                Column(modifier = Modifier.fillMaxSize()) {
                    nameField(
                        Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                    )
                    canvas(
                        Modifier
                            .weight(1f)
                            .fillMaxWidth()
                            .heightIn(min = MIN_CANVAS_HEIGHT)
                            .padding(horizontal = 16.dp),
                    )
                    controls(Modifier)
                }
            }
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
