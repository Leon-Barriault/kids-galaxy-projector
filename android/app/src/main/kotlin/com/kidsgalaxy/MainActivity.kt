package com.kidsgalaxy

import android.content.Context
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
import com.kidsgalaxy.connection.SharedPreferencesUiLanguageStore
import com.kidsgalaxy.connection.UiLanguage
import com.kidsgalaxy.connection.withUiLanguage
import com.kidsgalaxy.ui.GalaxyPickerDialog
import com.kidsgalaxy.ui.PlanetDrawerScreen
import com.kidsgalaxy.ui.theme.KidsGalaxyTheme
import java.net.URI

/** Single-screen kiosk activity with persistent galaxy and language targets. */
class MainActivity : ComponentActivity() {
    override fun attachBaseContext(newBase: Context) {
        val language = SharedPreferencesUiLanguageStore(newBase).load()
        super.attachBaseContext(newBase.withUiLanguage(language))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            KidsGalaxyTheme {
                val store = remember { SharedPreferencesGalaxyTargetStore(this) }
                val languageStore = remember { SharedPreferencesUiLanguageStore(this) }
                val language = remember { languageStore.load() }
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
                    language = language,
                    onConfigureGalaxy = { showGalaxyPicker = true },
                    onToggleLanguage = {
                        languageStore.save(language.toggled())
                        recreate()
                    },
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
