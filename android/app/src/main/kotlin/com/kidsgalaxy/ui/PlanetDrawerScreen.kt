package com.kidsgalaxy.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.kidsgalaxy.R
import com.kidsgalaxy.connection.GalaxyTarget
import com.kidsgalaxy.di.ServiceLocator
import com.kidsgalaxy.domain.model.PlanetCompanion
import com.kidsgalaxy.domain.model.PlanetStyle
import com.kidsgalaxy.presentation.DrawingUiState
import com.kidsgalaxy.presentation.DrawingViewModel

private val SIDE_PANEL_WIDTH = 340.dp
private val MIN_CANVAS_HEIGHT = 220.dp

private enum class CreationStep {
    STYLE,
    DRAW,
    FRIENDS,
    LAUNCH,
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlanetDrawerScreen(
    galaxy: GalaxyTarget,
    onConfigureGalaxy: () -> Unit,
    viewModel: DrawingViewModel =
        viewModel(
            key = "drawing:${galaxy.baseUrl}",
            factory = ServiceLocator.viewModelFactory(LocalContext.current, galaxy.baseUrl),
        ),
) {
    val state by viewModel.uiState.collectAsState()
    var planetName by rememberSaveable { mutableStateOf("") }
    var step by rememberSaveable { mutableStateOf(CreationStep.STYLE) }
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
        Column(
            modifier =
                Modifier
                    .padding(padding)
                    .fillMaxSize(),
        ) {
            StepHeader(step)
            when (step) {
                CreationStep.STYLE ->
                    StyleStep(
                        selected = state.planetStyle,
                        onSelect = viewModel::choosePlanetStyle,
                        onNext = { step = CreationStep.DRAW },
                    )

                CreationStep.DRAW ->
                    DrawingStep(
                        state = state,
                        planetName = planetName,
                        onNameChange = { planetName = it },
                        viewModel = viewModel,
                        onBack = { step = CreationStep.STYLE },
                        onNext = { step = CreationStep.FRIENDS },
                    )

                CreationStep.FRIENDS ->
                    FriendsStep(
                        selected = state.companions,
                        onToggle = viewModel::toggleCompanion,
                        onBack = { step = CreationStep.DRAW },
                        onNext = { step = CreationStep.LAUNCH },
                    )

                CreationStep.LAUNCH ->
                    LaunchStep(
                        state = state,
                        planetName = planetName.ifBlank { defaultName },
                        onBack = { step = CreationStep.FRIENDS },
                        onLaunch = {
                            viewModel.sendPlanet(planetName.ifBlank { defaultName })
                        },
                    )
            }
        }
    }

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
                        step = CreationStep.STYLE
                    },
                ) {
                    Text(stringResource(R.string.awesome))
                }
            },
        )
    }
}

@Composable
private fun StepHeader(step: CreationStep) {
    val labels = listOf("1  Style", "2  Draw", "3  Friends", "4  Launch")
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        labels.forEachIndexed { index, label ->
            val active = index == step.ordinal
            Text(
                text = if (active) "● $label" else label,
                modifier = Modifier.weight(1f),
                color =
                    if (active) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                fontWeight = if (active) FontWeight.Bold else FontWeight.Normal,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun StyleStep(
    selected: PlanetStyle,
    onSelect: (PlanetStyle) -> Unit,
    onNext: () -> Unit,
) {
    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Text(
            "First, pick your planet shape!",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
        )
        Text(
            "You will paint it on the next screen.",
            style = MaterialTheme.typography.titleMedium,
        )
        StyleRow(
            first = PlanetStyle.CLASSIC,
            firstEmoji = "🌍",
            firstLabel = "Classic",
            second = PlanetStyle.RINGED,
            secondEmoji = "🪐",
            secondLabel = "Ringed",
            selected = selected,
            onSelect = onSelect,
        )
        StyleRow(
            first = PlanetStyle.CRATERED,
            firstEmoji = "🌑",
            firstLabel = "Craters",
            second = PlanetStyle.SPIKY,
            secondEmoji = "⛰️",
            secondLabel = "Spiky mountains",
            selected = selected,
            onSelect = onSelect,
        )
        Text(
            "Spiky mountains means one whole planet with different-height peaks all around it.",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
        )
        Button(
            onClick = onNext,
            modifier =
                Modifier
                    .fillMaxWidth()
                    .height(64.dp),
        ) {
            Text("Next: Paint it!  🎨", fontSize = 20.sp)
        }
    }
}

@Composable
private fun StyleRow(
    first: PlanetStyle,
    firstEmoji: String,
    firstLabel: String,
    second: PlanetStyle,
    secondEmoji: String,
    secondLabel: String,
    selected: PlanetStyle,
    onSelect: (PlanetStyle) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        StyleButton(
            style = first,
            emoji = firstEmoji,
            label = firstLabel,
            selected = selected == first,
            onSelect = onSelect,
            modifier = Modifier.weight(1f),
        )
        StyleButton(
            style = second,
            emoji = secondEmoji,
            label = secondLabel,
            selected = selected == second,
            onSelect = onSelect,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun StyleButton(
    style: PlanetStyle,
    emoji: String,
    label: String,
    selected: Boolean,
    onSelect: (PlanetStyle) -> Unit,
    modifier: Modifier,
) {
    val content: @Composable () -> Unit = {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(emoji, fontSize = 44.sp)
            Text(
                label,
                fontSize = 19.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )
            Text(if (selected) "✓ Picked" else "Tap to pick")
        }
    }
    if (selected) {
        Button(
            onClick = { onSelect(style) },
            modifier = modifier.height(132.dp),
        ) {
            content()
        }
    } else {
        OutlinedButton(
            onClick = { onSelect(style) },
            modifier = modifier.height(132.dp),
        ) {
            content()
        }
    }
}

@Composable
private fun DrawingStep(
    state: DrawingUiState,
    planetName: String,
    onNameChange: (String) -> Unit,
    viewModel: DrawingViewModel,
    onBack: () -> Unit,
    onNext: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            "Paint your ${styleLabel(state.planetStyle)} planet",
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
        )
        BoxWithConstraints(
            modifier =
                Modifier
                    .weight(1f)
                    .fillMaxWidth(),
        ) {
            val sideBySide = maxWidth > maxHeight && maxWidth >= 600.dp
            val nameField: @Composable (Modifier) -> Unit = { fieldModifier ->
                OutlinedTextField(
                    value = planetName,
                    onValueChange = onNameChange,
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
                    modifier =
                        canvasModifier.semantics {
                            contentDescription = canvasDescription
                        },
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
                    onLaunch = onNext,
                    modifier = controlsModifier,
                )
            }

            if (sideBySide) {
                Row(modifier = Modifier.fillMaxSize()) {
                    canvas(
                        Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .padding(16.dp),
                    )
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
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedButton(
                onClick = onBack,
                modifier = Modifier.weight(1f),
            ) {
                Text("← Style")
            }
            Button(
                onClick = onNext,
                enabled = state.canLaunch,
                modifier = Modifier.weight(2f),
            ) {
                Text("Next: Space friends  🚀")
            }
        }
    }
}

@Composable
private fun FriendsStep(
    selected: Set<PlanetCompanion>,
    onToggle: (PlanetCompanion) -> Unit,
    onBack: () -> Unit,
    onNext: () -> Unit,
) {
    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Text(
            "Add space friends!",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
        )
        Text(
            "Pick as many as you like. They will move around your planet!",
            style = MaterialTheme.typography.titleMedium,
        )
        CompanionRow(
            first = PlanetCompanion.MOON,
            firstEmoji = "🌙",
            firstLabel = "Moon",
            second = PlanetCompanion.STARS,
            secondEmoji = "⭐",
            secondLabel = "Stars",
            selected = selected,
            onToggle = onToggle,
        )
        CompanionRow(
            first = PlanetCompanion.SATELLITE,
            firstEmoji = "🛰️",
            firstLabel = "Satellite",
            second = PlanetCompanion.ASTRONAUT,
            secondEmoji = "🧑‍🚀",
            secondLabel = "Astronaut",
            selected = selected,
            onToggle = onToggle,
        )
        Spacer(Modifier.height(8.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedButton(
                onClick = onBack,
                modifier = Modifier.weight(1f),
            ) {
                Text("← Paint")
            }
            Button(
                onClick = onNext,
                modifier = Modifier.weight(2f),
            ) {
                Text("Next: Launch!  ✨")
            }
        }
    }
}

@Composable
private fun CompanionRow(
    first: PlanetCompanion,
    firstEmoji: String,
    firstLabel: String,
    second: PlanetCompanion,
    secondEmoji: String,
    secondLabel: String,
    selected: Set<PlanetCompanion>,
    onToggle: (PlanetCompanion) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        CompanionButton(
            companion = first,
            emoji = firstEmoji,
            label = firstLabel,
            selected = first in selected,
            onToggle = onToggle,
            modifier = Modifier.weight(1f),
        )
        CompanionButton(
            companion = second,
            emoji = secondEmoji,
            label = secondLabel,
            selected = second in selected,
            onToggle = onToggle,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun CompanionButton(
    companion: PlanetCompanion,
    emoji: String,
    label: String,
    selected: Boolean,
    onToggle: (PlanetCompanion) -> Unit,
    modifier: Modifier,
) {
    val content: @Composable () -> Unit = {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(emoji, fontSize = 44.sp)
            Text(label, fontSize = 19.sp, fontWeight = FontWeight.Bold)
            Text(if (selected) "✓ Added" else "Tap to add")
        }
    }
    if (selected) {
        Button(
            onClick = { onToggle(companion) },
            modifier = modifier.height(132.dp),
        ) {
            content()
        }
    } else {
        OutlinedButton(
            onClick = { onToggle(companion) },
            modifier = modifier.height(132.dp),
        ) {
            content()
        }
    }
}

@Composable
private fun LaunchStep(
    state: DrawingUiState,
    planetName: String,
    onBack: () -> Unit,
    onLaunch: () -> Unit,
) {
    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Text(
            "Your space world is ready!",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
        )
        Text(
            "$planetName  •  ${styleLabel(state.planetStyle)}",
            style = MaterialTheme.typography.titleLarge,
        )
        Text(
            if (state.companions.isEmpty()) {
                "No space friends this time."
            } else {
                val friends =
                    state.companions
                        .sortedBy { it.ordinal }
                        .joinToString { companionLabel(it) }
                "Friends: $friends"
            },
            style = MaterialTheme.typography.titleMedium,
            textAlign = TextAlign.Center,
        )
        Text(
            animationSummary(state),
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(12.dp))
        Button(
            onClick = onLaunch,
            enabled = state.canLaunch,
            modifier =
                Modifier
                    .fillMaxWidth()
                    .height(72.dp),
        ) {
            Text(
                if (state.isSending) "Flying to the galaxy…" else "🚀  Send to Galaxy",
                fontSize = 22.sp,
            )
        }
        OutlinedButton(
            onClick = onBack,
            enabled = !state.isSending,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("← Change space friends")
        }
    }
}

private fun styleLabel(style: PlanetStyle): String =
    when (style) {
        PlanetStyle.CLASSIC -> "Classic"
        PlanetStyle.RINGED -> "Ringed"
        PlanetStyle.CRATERED -> "Cratered"
        PlanetStyle.SPIKY -> "Spiky mountain"
    }

private fun companionLabel(companion: PlanetCompanion): String =
    when (companion) {
        PlanetCompanion.MOON -> "Moon"
        PlanetCompanion.STARS -> "Stars"
        PlanetCompanion.SATELLITE -> "Satellite"
        PlanetCompanion.ASTRONAUT -> "Astronaut"
    }

private fun animationSummary(state: DrawingUiState): String {
    val effects = mutableListOf<String>()
    if (state.planetStyle == PlanetStyle.RINGED) effects += "ring spins slowly"
    if (PlanetCompanion.MOON in state.companions) effects += "moon orbits"
    if (PlanetCompanion.STARS in state.companions) effects += "stars twinkle"
    if (PlanetCompanion.SATELLITE in state.companions) effects += "satellite circles"
    if (PlanetCompanion.ASTRONAUT in state.companions) effects += "astronaut floats"
    return if (effects.isEmpty()) {
        "Your painted planet will gently spin in space."
    } else {
        "Animation: ${effects.joinToString()}."
    }
}
