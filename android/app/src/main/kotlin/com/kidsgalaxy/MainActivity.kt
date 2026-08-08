package com.kidsgalaxy

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.kidsgalaxy.connection.GalaxyTarget
import com.kidsgalaxy.connection.SharedPreferencesGalaxyTargetStore
import com.kidsgalaxy.ui.GalaxyPickerDialog
import com.kidsgalaxy.ui.PlanetDrawerScreen
import com.kidsgalaxy.ui.theme.KidsGalaxyTheme
import java.net.URI

/** Single-screen kiosk activity with a persistent galaxy target. */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            KidsGalaxyTheme {
                val store = remember { SharedPreferencesGalaxyTargetStore(this) }
                val defaultTarget =
                    remember {
                        GalaxyTarget.create("Default Galaxy", BuildConfig.SERVER_BASE_URL)
                    }
                var selectedGalaxy by remember { mutableStateOf(store.load(defaultTarget)) }
                var showGalaxyPicker by remember { mutableStateOf(false) }
                val fallbackScheme =
                    remember { URI(BuildConfig.SERVER_BASE_URL).scheme ?: "http" }

                PlanetDrawerScreen(
                    galaxy = selectedGalaxy,
                    onConfigureGalaxy = { showGalaxyPicker = true },
                )

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
