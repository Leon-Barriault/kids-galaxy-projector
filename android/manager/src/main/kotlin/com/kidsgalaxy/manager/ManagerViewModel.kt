package com.kidsgalaxy.manager

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.kidsgalaxy.manager.data.ApiFactory
import com.kidsgalaxy.manager.data.ManagerApi
import com.kidsgalaxy.manager.data.PlanetDto
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ManagerUiState(
    val planets: List<PlanetDto> = emptyList(),
    val isLoading: Boolean = false,
    val deletingIds: Set<String> = emptySet(),
    val errorMessage: String? = null,
    val statusMessage: String? = null,
)

class ManagerViewModel(
    private val api: ManagerApi = ApiFactory.create(),
) : ViewModel() {
    private val _uiState = MutableStateFlow(ManagerUiState())
    val uiState: StateFlow<ManagerUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            try {
                val response = api.listPlanets(limit = 30)
                if (response.isSuccessful) {
                    val planets = response.body()?.planets.orEmpty()
                    _uiState.update {
                        it.copy(
                            planets = planets,
                            isLoading = false,
                            statusMessage = "${planets.size} planet(s) stored",
                        )
                    }
                } else {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            errorMessage = "Could not load planets (${response.code()})",
                        )
                    }
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = e.message ?: "Network error",
                    )
                }
            }
        }
    }

    fun deletePlanet(id: String) {
        if (id in _uiState.value.deletingIds) return
        viewModelScope.launch {
            _uiState.update { it.copy(deletingIds = it.deletingIds + id, errorMessage = null) }
            try {
                val response = api.deletePlanet(id)
                if (response.isSuccessful) {
                    val name = response.body()?.name
                    _uiState.update { state ->
                        state.copy(
                            planets = state.planets.filterNot { it.id == id },
                            deletingIds = state.deletingIds - id,
                            statusMessage =
                                if (name != null) {
                                    "Removed \"$name\""
                                } else {
                                    "Planet removed"
                                },
                        )
                    }
                } else {
                    _uiState.update {
                        it.copy(
                            deletingIds = it.deletingIds - id,
                            errorMessage = "Delete failed (${response.code()})",
                        )
                    }
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        deletingIds = it.deletingIds - id,
                        errorMessage = e.message ?: "Network error",
                    )
                }
            }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
    }

    companion object {
        fun factory(): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T = ManagerViewModel() as T
            }
    }
}
