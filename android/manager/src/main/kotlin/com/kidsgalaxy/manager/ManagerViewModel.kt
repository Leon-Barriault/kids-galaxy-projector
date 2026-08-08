package com.kidsgalaxy.manager

import android.content.Context
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
    val canClearAll: Boolean get() = planets.isNotEmpty() && !isClearing && !isLoading
}

class ManagerViewModel(
    private val api: ManagerApi,
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
            } catch (error: Exception) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = error.message ?: "Network error",
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
            } catch (error: Exception) {
                _uiState.update {
                    it.copy(
                        deletingIds = it.deletingIds - id,
                        errorMessage = error.message ?: "Network error",
                    )
                }
            }
        }
    }

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
            } catch (error: Exception) {
                _uiState.update {
                    it.copy(
                        isClearing = false,
                        errorMessage = error.message ?: "Network error",
                    )
                }
            }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
    }

    companion object {
        fun factory(
            context: Context,
            baseUrl: String = BuildConfig.SERVER_BASE_URL,
        ): ViewModelProvider.Factory {
            val appContext = context.applicationContext
            return object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    require(modelClass.isAssignableFrom(ManagerViewModel::class.java)) {
                        "Unsupported ViewModel: ${modelClass.name}"
                    }
                    return ManagerViewModel(ApiFactory.create(appContext, baseUrl)) as T
                }
            }
        }
    }
}
