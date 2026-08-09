package com.kidsgalaxy.manager

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.kidsgalaxy.manager.data.ApiFactory
import com.kidsgalaxy.manager.data.BehaviorSettingsDto
import com.kidsgalaxy.manager.data.ManagerApi
import com.kidsgalaxy.manager.data.PlanetDto
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

sealed interface ManagerStatus {
    data class Stored(
        val count: Int,
    ) : ManagerStatus

    data class Removed(
        val name: String?,
    ) : ManagerStatus

    data class Cleared(
        val count: Int,
    ) : ManagerStatus

    data class ProjectorLanguageChanged(
        val language: String,
    ) : ManagerStatus
}

sealed interface ManagerError {
    data class LoadFailed(
        val code: Int,
    ) : ManagerError

    data class DeleteFailed(
        val code: Int,
    ) : ManagerError

    data class ClearFailed(
        val code: Int,
    ) : ManagerError

    data class BehaviorLoadFailed(
        val code: Int,
    ) : ManagerError

    data class BehaviorUpdateFailed(
        val code: Int,
    ) : ManagerError

    data object Network : ManagerError
}

data class ManagerUiState(
    val planets: List<PlanetDto> = emptyList(),
    val isLoading: Boolean = false,
    val deletingIds: Set<String> = emptySet(),
    val isClearing: Boolean = false,
    val projectorLanguage: String = "en",
    val isProjectorLanguageLoading: Boolean = true,
    val isUpdatingProjectorLanguage: Boolean = false,
    val error: ManagerError? = null,
    val status: ManagerStatus? = null,
) {
    val canClearAll: Boolean get() = planets.isNotEmpty() && !isClearing && !isLoading
}

class ManagerViewModel(
    private val api: ManagerApi,
) : ViewModel() {
    private val _uiState = MutableStateFlow(ManagerUiState())
    val uiState: StateFlow<ManagerUiState> = _uiState.asStateFlow()
    private var behaviorSettings: BehaviorSettingsDto? = null

    init {
        refresh()
        refreshBehavior()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val response = api.listPlanets(limit = 30)
                if (response.isSuccessful) {
                    val planets = response.body()?.planets.orEmpty()
                    _uiState.update {
                        it.copy(
                            planets = planets,
                            isLoading = false,
                            status = ManagerStatus.Stored(planets.size),
                        )
                    }
                } else {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            error = ManagerError.LoadFailed(response.code()),
                        )
                    }
                }
            } catch (_: Exception) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = ManagerError.Network,
                    )
                }
            }
        }
    }

    fun refreshBehavior() {
        viewModelScope.launch {
            _uiState.update { it.copy(isProjectorLanguageLoading = true) }
            try {
                val response = api.getBehavior()
                if (response.isSuccessful) {
                    val settings = response.body()?.settings
                    if (settings != null) {
                        behaviorSettings = settings
                        _uiState.update {
                            it.copy(
                                projectorLanguage = settings.projectorLanguage,
                                isProjectorLanguageLoading = false,
                            )
                        }
                    } else {
                        _uiState.update { it.copy(isProjectorLanguageLoading = false) }
                    }
                } else {
                    _uiState.update {
                        it.copy(
                            isProjectorLanguageLoading = false,
                            error = ManagerError.BehaviorLoadFailed(response.code()),
                        )
                    }
                }
            } catch (_: Exception) {
                _uiState.update {
                    it.copy(
                        isProjectorLanguageLoading = false,
                        error = ManagerError.Network,
                    )
                }
            }
        }
    }

    fun setProjectorLanguage(language: String) {
        val normalized = language.lowercase()
        if (normalized !in setOf("en", "fr")) return
        if (_uiState.value.isUpdatingProjectorLanguage) return
        val current = behaviorSettings ?: return
        if (current.projectorLanguage == normalized) return

        viewModelScope.launch {
            _uiState.update { it.copy(isUpdatingProjectorLanguage = true, error = null) }
            try {
                val response =
                    api.updateBehavior(
                        current.copy(projectorLanguage = normalized),
                    )
                if (response.isSuccessful) {
                    val settings = response.body()?.settings ?: current.copy(projectorLanguage = normalized)
                    behaviorSettings = settings
                    _uiState.update {
                        it.copy(
                            projectorLanguage = settings.projectorLanguage,
                            isUpdatingProjectorLanguage = false,
                            status = ManagerStatus.ProjectorLanguageChanged(settings.projectorLanguage),
                        )
                    }
                } else {
                    _uiState.update {
                        it.copy(
                            isUpdatingProjectorLanguage = false,
                            error = ManagerError.BehaviorUpdateFailed(response.code()),
                        )
                    }
                }
            } catch (_: Exception) {
                _uiState.update {
                    it.copy(
                        isUpdatingProjectorLanguage = false,
                        error = ManagerError.Network,
                    )
                }
            }
        }
    }

    fun deletePlanet(id: String) {
        if (id in _uiState.value.deletingIds) return
        viewModelScope.launch {
            _uiState.update { it.copy(deletingIds = it.deletingIds + id, error = null) }
            try {
                val response = api.deletePlanet(id)
                if (response.isSuccessful) {
                    val name = response.body()?.name
                    _uiState.update { state ->
                        state.copy(
                            planets = state.planets.filterNot { it.id == id },
                            deletingIds = state.deletingIds - id,
                            status = ManagerStatus.Removed(name),
                        )
                    }
                } else {
                    _uiState.update {
                        it.copy(
                            deletingIds = it.deletingIds - id,
                            error = ManagerError.DeleteFailed(response.code()),
                        )
                    }
                }
            } catch (_: Exception) {
                _uiState.update {
                    it.copy(
                        deletingIds = it.deletingIds - id,
                        error = ManagerError.Network,
                    )
                }
            }
        }
    }

    fun clearAll() {
        if (_uiState.value.isClearing) return
        viewModelScope.launch {
            _uiState.update { it.copy(isClearing = true, error = null) }
            try {
                val response = api.clearPlanets()
                if (response.isSuccessful) {
                    val removed = response.body()?.removed ?: 0
                    _uiState.update {
                        it.copy(
                            planets = emptyList(),
                            deletingIds = emptySet(),
                            isClearing = false,
                            status = ManagerStatus.Cleared(removed),
                        )
                    }
                } else {
                    _uiState.update {
                        it.copy(
                            isClearing = false,
                            error = ManagerError.ClearFailed(response.code()),
                        )
                    }
                }
            } catch (_: Exception) {
                _uiState.update {
                    it.copy(
                        isClearing = false,
                        error = ManagerError.Network,
                    )
                }
            }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
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
