package com.kidsgalaxy.manager

import android.content.Context
import android.graphics.BitmapFactory
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.print.PrintHelper
import com.kidsgalaxy.connection.GalaxyTarget
import com.kidsgalaxy.connection.SharedPreferencesGalaxyTargetStore
import com.kidsgalaxy.connection.SharedPreferencesUiLanguageStore
import com.kidsgalaxy.connection.withUiLanguage
import com.kidsgalaxy.manager.data.PlanetDto
import com.kidsgalaxy.manager.data.PlanetExportClient
import com.kidsgalaxy.manager.ui.GalaxyPickerDialog
import com.kidsgalaxy.manager.ui.ManagerTabbedScreen
import kotlinx.coroutines.launch
import java.net.URI

/** Space-dark, matching the drawing app and the projector page. */
private val ManagerColors =
    darkColorScheme(
        primary = Color(0xFF4FC3F7),
        onPrimary = Color(0xFF00243A),
        secondary = Color(0xFFFFB74D),
        background = Color(0xFF0A0E2A),
        onBackground = Color(0xFFECEFF1),
        surface = Color(0xFF141A3A),
        onSurface = Color(0xFFECEFF1),
        error = Color(0xFFEF9A9A),
        onError = Color(0xFF3A0000),
    )

class MainActivity : ComponentActivity() {
    override fun attachBaseContext(newBase: Context) {
        val language = SharedPreferencesUiLanguageStore(newBase).load()
        super.attachBaseContext(newBase.withUiLanguage(language))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val store = remember { SharedPreferencesGalaxyTargetStore(this) }
            val languageStore = remember { SharedPreferencesUiLanguageStore(this) }
            val language = remember { languageStore.load() }
            val defaultTarget =
                remember {
                    GalaxyTarget.create("Default Galaxy", BuildConfig.SERVER_BASE_URL)
                }
            var selectedGalaxy by remember { mutableStateOf(store.load(defaultTarget)) }
            var showGalaxyPicker by remember { mutableStateOf(false) }
            var pendingStlBytes by remember { mutableStateOf<ByteArray?>(null) }
            val fallbackScheme = remember { URI(BuildConfig.SERVER_BASE_URL).scheme ?: "http" }
            val exportClient =
                remember(selectedGalaxy.baseUrl) {
                    PlanetExportClient(this, selectedGalaxy.baseUrl)
                }
            val stlLauncher =
                rememberLauncherForActivityResult(
                    ActivityResultContracts.CreateDocument("model/stl"),
                ) { uri ->
                    val content = pendingStlBytes
                    if (uri != null && content != null) {
                        runCatching {
                            contentResolver.openOutputStream(uri)?.use { output ->
                                output.write(content)
                            } ?: error("Could not open the selected document")
                        }.onFailure { showExportError() }
                    }
                    pendingStlBytes = null
                }

            val managerViewModel: ManagerViewModel =
                viewModel(
                    key = "manager:${selectedGalaxy.baseUrl}",
                    factory =
                        ManagerViewModel.factory(
                            context = this,
                            baseUrl = selectedGalaxy.baseUrl,
                        ),
                )
            val state by managerViewModel.uiState.collectAsState()

            MaterialTheme(colorScheme = ManagerColors) {
                Surface(
                    color = MaterialTheme.colorScheme.background,
                    modifier = Modifier.safeDrawingPadding(),
                ) {
                    ManagerTabbedScreen(
                        state = state,
                        galaxy = selectedGalaxy,
                        language = language,
                        onToggleLanguage = {
                            languageStore.save(language.toggled())
                            recreate()
                        },
                        onProjectorLanguageChange = managerViewModel::setProjectorLanguage,
                        onConfigureGalaxy = { showGalaxyPicker = true },
                        onRefresh = {
                            managerViewModel.refresh()
                            managerViewModel.refreshBehavior()
                        },
                        onDelete = managerViewModel::deletePlanet,
                        onPrintPlanet = { planet ->
                            printPlanet(exportClient, planet)
                        },
                        onExportPlanetStl = { planet ->
                            lifecycleScope.launch {
                                runCatching { exportClient.stl(planet.id) }
                                    .onSuccess { bytes ->
                                        pendingStlBytes = bytes
                                        stlLauncher.launch(stlFilename(planet))
                                    }
                                    .onFailure { showExportError() }
                            }
                        },
                        onClearAll = managerViewModel::clearAll,
                        onClearError = managerViewModel::clearError,
                        onAsteroidBeltChange = managerViewModel::setAsteroidBeltEnabled,
                        onCometsChange = managerViewModel::setCometsEnabled,
                        onCometFrequencyChange = managerViewModel::setCometFrequency,
                        onFlybyAsteroidsChange = managerViewModel::setFlybyAsteroidsEnabled,
                        onFlybyFrequencyChange = managerViewModel::setFlybyFrequency,
                        onBehaviorModeChange = managerViewModel::setBehaviorMode,
                        onManualThemeChange = managerViewModel::setManualTheme,
                        onThemeEnabledChange = managerViewModel::setThemeEnabled,
                        onAmbientEffectsChange = managerViewModel::setAmbientEffects,
                    )
                }

                if (showGalaxyPicker) {
                    GalaxyPickerDialog(
                        current = selectedGalaxy,
                        fallbackScheme = fallbackScheme,
                        onSelect = { target ->
                            store.save(target)
                            selectedGalaxy = target
                            showGalaxyPicker = false
                        },
                        onDismiss = { showGalaxyPicker = false },
                    )
                }
            }
        }
    }

    private fun printPlanet(
        exportClient: PlanetExportClient,
        planet: PlanetDto,
    ) {
        lifecycleScope.launch {
            runCatching { exportClient.printSheet(planet.id) }
                .onSuccess { bytes ->
                    val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                    if (bitmap == null) {
                        showExportError()
                        return@onSuccess
                    }
                    PrintHelper(this@MainActivity).apply {
                        scaleMode = PrintHelper.SCALE_MODE_FIT
                        colorMode = PrintHelper.COLOR_MODE_COLOR
                    }.printBitmap("${planet.name} - Kids Galaxy", bitmap)
                }
                .onFailure { showExportError() }
        }
    }

    private fun showExportError() {
        Toast.makeText(this, R.string.export_failed, Toast.LENGTH_LONG).show()
    }

    private fun stlFilename(planet: PlanetDto): String {
        val safeName =
            planet.name
                .trim()
                .replace(Regex("[^A-Za-z0-9._-]+"), "_")
                .trim('_')
                .ifBlank { "planet" }
        return "${safeName}_${planet.id}.stl"
    }
}
