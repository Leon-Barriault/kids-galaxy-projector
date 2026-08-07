package com.kidsgalaxy

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.kidsgalaxy.ui.PlanetDrawerScreen
import com.kidsgalaxy.ui.theme.KidsGalaxyTheme

/**
 * Single-screen kiosk activity.
 *
 * The ViewModel is obtained through the standard `viewModel()` factory inside
 * [PlanetDrawerScreen], so an in-progress drawing survives recomposition and
 * configuration changes. The server address and transport (cleartext vs mTLS)
 * come from BuildConfig - see app/build.gradle.kts.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            KidsGalaxyTheme {
                PlanetDrawerScreen()
            }
        }
    }
}
