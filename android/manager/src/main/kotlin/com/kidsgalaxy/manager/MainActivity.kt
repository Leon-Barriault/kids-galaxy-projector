package com.kidsgalaxy.manager

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
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
import androidx.lifecycle.viewmodel.compose.viewModel
import com.kidsgalaxy.connection.GalaxyTarget
import com.kidsgalaxy.connection.SharedPreferencesGalaxyTargetStore
import com.kidsgalaxy.manager.ui.GalaxyPickerDialog
import com.kidsgalaxy.manager.ui.ManagerScreen
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
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val store = remember { SharedPreferencesGalaxyTargetStore(this) }
            val defaultTarget =
                remember {
                    GalaxyTarget.create("Default Galaxy", BuildConfig.SERVER_BASE_URL)
                }
            var selectedGalaxy by remember { mutableStateOf(store.load(defaultTarget)) }
            var showGalaxyPicker by remember { mutableStateOf(false) }
            val fallbackScheme =
                remember { URI(BuildConfig.SERVER_BASE_URL).scheme ?: "http" }

            val managerViewModel: ManagerViewModel =
                viewModel(
                    key = "manager:${selectedGalaxy.baseUrl}",
                    factory = ManagerViewModel.factory(selectedGalaxy.baseUrl),
                )
            val state by managerViewModel.uiState.collectAsState()

            MaterialTheme(colorScheme = ManagerColors) {
                Surface(
                    color = MaterialTheme.colorScheme.background,
                    modifier = Modifier.safeDrawingPadding(),
                ) {
                    ManagerScreen(
                        state = state,
                        galaxy = selectedGalaxy,
                        onConfigureGalaxy = { showGalaxyPicker = true },
                        onRefresh = managerViewModel::refresh,
                        onDelete = managerViewModel::deletePlanet,
                        onClearAll = managerViewModel::clearAll,
                        onClearError = managerViewModel::clearError,
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
}
