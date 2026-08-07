package com.kidsgalaxy

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.kidsgalaxy.ui.PlanetDrawerScreen
import com.kidsgalaxy.ui.theme.KidsGalaxyTheme
import com.kidsgalaxy.viewmodel.DrawingViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            KidsGalaxyTheme {
                val viewModel = DrawingViewModel().apply {
                    // Change this IP if your Raspberry Pi uses a different address
                    // Default NetworkManager hotspot IP is usually 10.42.0.1
                    initApi("http://10.42.0.1:8000/")
                }
                PlanetDrawerScreen(viewModel = viewModel)
            }
        }
    }
}
