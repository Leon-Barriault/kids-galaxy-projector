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
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.lifecycle.viewmodel.compose.viewModel
import com.kidsgalaxy.manager.ui.ManagerScreen

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
            val viewModel: ManagerViewModel = viewModel(factory = ManagerViewModel.factory())
            val state by viewModel.uiState.collectAsState()

            // A MaterialTheme is not optional here: the delete confirmation and
            // error dialogs are Material3 components, and without a scheme they
            // render with the default *light* palette inside a dark app.
            MaterialTheme(colorScheme = ManagerColors) {
                Surface(
                    color = MaterialTheme.colorScheme.background,
                    // enableEdgeToEdge draws behind the system bars, so the
                    // content has to inset itself or the header sits under the
                    // status bar and the last row under the navigation bar.
                    modifier = Modifier.safeDrawingPadding(),
                ) {
                    ManagerScreen(
                        state = state,
                        onRefresh = viewModel::refresh,
                        onDelete = viewModel::deletePlanet,
                        onClearAll = viewModel::clearAll,
                        onClearError = viewModel::clearError,
                    )
                }
            }
        }
    }
}
