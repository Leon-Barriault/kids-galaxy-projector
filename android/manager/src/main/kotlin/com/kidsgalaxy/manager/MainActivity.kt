package com.kidsgalaxy.manager

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.graphics.Color
import androidx.lifecycle.viewmodel.compose.viewModel
import com.kidsgalaxy.manager.ui.ManagerScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val viewModel: ManagerViewModel = viewModel(factory = ManagerViewModel.factory())
            val state by viewModel.uiState.collectAsState()

            androidx.compose.material3.Surface(color = Color(0xFF0A0E2A)) {
                ManagerScreen(
                    state = state,
                    onRefresh = viewModel::refresh,
                    onDelete = viewModel::deletePlanet,
                    onClearError = viewModel::clearError,
                )
            }
        }
    }
}
