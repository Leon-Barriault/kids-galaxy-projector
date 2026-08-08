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
    val isClearing: Boolean = false,
    val errorMessage: String? = null,
    val statusMessage: String? = null,
) {
    /** Nothing to clear, and no second clear while one is in flight. */
    val canClearAll: Boolean get() = planets.isNotEmpty() && !isClearing && !isLoading
}

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

    /**
     * Empties the gallery in one request.
     *
     * Deliberately not a loop over deletePlanet: that would be thirty round
     * trips and thirty separate events, and the projector would flicker
     * through the removals one at a time instead of emptying at once.
     */
    fun clearAll() {
        if (_uiState.value.isClearing) return
        viewModelScope.launch {
            _uiState.update { it.copy(isClearing = true, errorMessage = null) }
            try {
                val response = api.clearPlanets()
                if (response.isSuccessful) {
                    val removed = response.body()?.removed ?: 0
                    _uiState.update {
                        it.copy(
                            planets = emptyList(),
                            deletingIds = emptySet(),
                            isClearing = false,
                            statusMessage = "Cleared $removed planet(s)",
                        )
                    }
                } else {
                    _uiState.update {
                        it.copy(
                            isClearing = false,
                            errorMessage = "Could not clear the gallery (${response.code()})",
                        )
                    }
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isClearing = false,
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
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    // Without the guard this hands back a ManagerViewModel for
                    // any request at all, and the mistake surfaces as a
                    // ClassCastException at the call site instead of here.
                    require(modelClass.isAssignableFrom(ManagerViewModel::class.java)) {
                        "Unsupported ViewModel: ${modelClass.name}"
                    }
                    return ManagerViewModel() as T
                }
            }
    }
}
