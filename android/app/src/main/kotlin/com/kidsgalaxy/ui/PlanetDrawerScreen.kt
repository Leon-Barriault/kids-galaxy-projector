package com.kidsgalaxy.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
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
import com.kidsgalaxy.connection.UiLanguage
import com.kidsgalaxy.di.ServiceLocator
import com.kidsgalaxy.domain.model.DEFAULT_RING_COLOR_ARGB
import com.kidsgalaxy.domain.model.PlanetCompanion
import com.kidsgalaxy.domain.model.PlanetStyle
import com.kidsgalaxy.presentation.DrawingUiState
import com.kidsgalaxy.presentation.DrawingViewModel

private val SIDE_PANEL_WIDTH = 340.dp
private val MIN_CANVAS_HEIGHT = 220.dp
private val RING_COLORS =
    listOf(
        DEFAULT_RING_COLOR_ARGB,
        0xFFFFC107.toInt(),
        0xFF4FC3F7.toInt(),
        0xFFFF7043.toInt(),
        0xFF66BB6A.toInt(),
        0xFFFFFFFF.toInt(),
    )

private enum class CreationStep {
    STYLE,
    DRAW,
    FRIENDS,
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlanetDrawerScreen(
    galaxy: GalaxyTarget,
    language: UiLanguage,
    onConfigureGalaxy: () -> Unit,
    onToggleLanguage: () -> Unit,
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
    val languageDescription = stringResource(R.string.language_toggle_description)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.screen_title)) },
                actions = {
                    TextButton(
                        onClick = onToggleLanguage,
                        modifier =
                            Modifier.semantics {
                                contentDescription = languageDescription
                            },
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
                        state = state,
                        onToggle = viewModel::toggleCompanion,
                        onBack = { step = CreationStep.DRAW },
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
    val labels =
        listOf(
            stringResource(R.string.step_style),
            stringResource(R.string.step_draw),
            stringResource(R.string.step_friends),
        )
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
            stringResource(R.string.style_intro_title),
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
        )
        Text(
            stringResource(R.string.style_intro_body),
            style = MaterialTheme.typography.titleMedium,
        )
        StyleRow(
            first = PlanetStyle.CLASSIC,
            firstEmoji = "🌍",
            firstLabel = stringResource(R.string.style_classic),
            second = PlanetStyle.RINGED,
            secondEmoji = "🪐",
            secondLabel = stringResource(R.string.style_ringed),
            selected = selected,
            onSelect = onSelect,
        )
        StyleRow(
            first = PlanetStyle.CRATERED,
            firstEmoji = "🌑",
            firstLabel = stringResource(R.string.style_cratered),
            second = PlanetStyle.SPIKY,
            secondEmoji = "✦",
            secondLabel = stringResource(R.string.style_spiky),
            selected = selected,
            onSelect = onSelect,
        )
        Text(
            stringResource(R.string.style_spiky_help),
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
            Text(stringResource(R.string.next_paint), fontSize = 20.sp)
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
            Text(
                stringResource(
                    if (selected) R.string.picked else R.string.tap_to_pick,
                ),
            )
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
            stringResource(
                R.string.paint_your_planet,
                stringResource(styleLabelResource(state.planetStyle)),
            ),
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
        )
        if (state.planetStyle == PlanetStyle.RINGED) {
            RingColorPicker(
                selectedColorArgb = state.ringColorArgb,
                onColorChange = viewModel::changeRingColor,
            )
        }
        if (state.planetStyle == PlanetStyle.CRATERED) {
            Text(
                stringResource(R.string.crater_paint_hint),
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 4.dp),
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
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
                    planetStyle = state.planetStyle,
                    ringColorArgb = state.ringColorArgb,
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
                Text(stringResource(R.string.back_style))
            }
            Button(
                onClick = onNext,
                enabled = state.canLaunch,
                modifier = Modifier.weight(2f),
            ) {
                Text(stringResource(R.string.next_friends))
            }
        }
    }
}

@Composable
private fun RingColorPicker(
    selectedColorArgb: Int,
    onColorChange: (Int) -> Unit,
) {
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(
            stringResource(R.string.ring_color_title),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )
        Text(
            stringResource(R.string.ring_color_hint),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            RING_COLORS.forEach { colorArgb ->
                val selected = colorArgb == selectedColorArgb
                Box(
                    modifier =
                        Modifier
                            .size(if (selected) 52.dp else 46.dp)
                            .background(Color(colorArgb), CircleShape)
                            .border(
                                width = if (selected) 4.dp else 2.dp,
                                color =
                                    if (selected) {
                                        MaterialTheme.colorScheme.primary
                                    } else {
                                        MaterialTheme.colorScheme.outline
                                    },
                                shape = CircleShape,
                            ).selectable(
                                selected = selected,
                                role = Role.RadioButton,
                                onClick = { onColorChange(colorArgb) },
                            ),
                )
            }
        }
    }
}

@Composable
private fun FriendsStep(
    state: DrawingUiState,
    onToggle: (PlanetCompanion) -> Unit,
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
            stringResource(R.string.friends_title),
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
        )
        Text(
            stringResource(R.string.friends_body),
            style = MaterialTheme.typography.titleMedium,
        )
        CompanionRow(
            first = PlanetCompanion.MOON,
            firstLabel = stringResource(R.string.friend_moon),
            second = PlanetCompanion.STARS,
            secondLabel = stringResource(R.string.friend_stars),
            selected = state.companions,
            onToggle = onToggle,
        )
        CompanionRow(
            first = PlanetCompanion.SATELLITE,
            firstLabel = stringResource(R.string.friend_satellite),
            second = PlanetCompanion.ASTRONAUT,
            secondLabel = stringResource(R.string.friend_astronaut),
            selected = state.companions,
            onToggle = onToggle,
        )
        Spacer(Modifier.height(8.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedButton(
                onClick = onBack,
                enabled = !state.isSending,
                modifier = Modifier.weight(1f),
            ) {
                Text(stringResource(R.string.back_paint))
            }
            Button(
                onClick = onLaunch,
                enabled = state.canLaunch,
                modifier =
                    Modifier
                        .weight(2f)
                        .height(64.dp),
            ) {
                Text(
                    stringResource(
                        if (state.isSending) R.string.launching else R.string.launch,
                    ),
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

@Composable
private fun CompanionRow(
    first: PlanetCompanion,
    firstLabel: String,
    second: PlanetCompanion,
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
            label = firstLabel,
            selected = first in selected,
            onToggle = onToggle,
            modifier = Modifier.weight(1f),
        )
        CompanionButton(
            companion = second,
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
            CompanionVisual(companion)
            Text(label, fontSize = 19.sp, fontWeight = FontWeight.Bold)
            Text(
                stringResource(
                    if (selected) R.string.added else R.string.tap_to_add,
                ),
            )
        }
    }
    if (selected) {
        Button(
            onClick = { onToggle(companion) },
            modifier = modifier.height(138.dp),
        ) {
            content()
        }
    } else {
        OutlinedButton(
            onClick = { onToggle(companion) },
            modifier = modifier.height(138.dp),
        ) {
            content()
        }
    }
}

@Composable
private fun CompanionVisual(companion: PlanetCompanion) {
    when (companion) {
        PlanetCompanion.MOON -> FullMoonIcon()
        PlanetCompanion.STARS -> Text("⭐", fontSize = 44.sp)
        PlanetCompanion.SATELLITE -> Text("🛰️", fontSize = 44.sp)
        PlanetCompanion.ASTRONAUT -> Text("🧑‍🚀", fontSize = 44.sp)
    }
}

@Composable
private fun FullMoonIcon() {
    Canvas(modifier = Modifier.size(52.dp)) {
        val radius = size.minDimension * 0.46f
        val centre = center
        val craterOne =
            centre +
                Offset(
                    -radius * 0.34f,
                    -radius * 0.22f,
                )
        val craterTwo =
            centre +
                Offset(
                    radius * 0.33f,
                    radius * 0.18f,
                )
        val craterThree =
            centre +
                Offset(
                    radius * 0.20f,
                    -radius * 0.38f,
                )
        drawCircle(
            color = Color(0xFFB7BDC7),
            radius = radius,
            center = centre,
        )
        drawCircle(
            color = Color(0xFF858C98),
            radius = radius * 0.23f,
            center = craterOne,
        )
        drawCircle(
            color = Color(0xFF949BA6),
            radius = radius * 0.16f,
            center = craterTwo,
        )
        drawCircle(
            color = Color(0xFF7C838E),
            radius = radius * 0.11f,
            center = craterThree,
        )
    }
}

private fun styleLabelResource(style: PlanetStyle): Int =
    when (style) {
        PlanetStyle.CLASSIC -> R.string.style_classic
        PlanetStyle.RINGED -> R.string.style_ringed
        PlanetStyle.CRATERED -> R.string.style_cratered
        PlanetStyle.SPIKY -> R.string.style_spiky
    }
