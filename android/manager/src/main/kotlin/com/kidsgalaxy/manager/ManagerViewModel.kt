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
    val behaviorSettings: BehaviorSettingsDto = BehaviorSettingsDto(),
    val isBehaviorLoading: Boolean = true,
    val isUpdatingBehavior: Boolean = false,
    val error: ManagerError? = null,
    val status: ManagerStatus? = null,
) {
    val canClearAll: Boolean get() = planets.isNotEmpty() && !isClearing && !isLoading
    val projectorLanguage: String get() = behaviorSettings.projectorLanguage
    val isProjectorLanguageLoading: Boolean get() = isBehaviorLoading
    val isUpdatingProjectorLanguage: Boolean get() = isUpdatingBehavior
}

class ManagerViewModel(
    private val api: ManagerApi,
) : ViewModel() {
    private val _uiState = MutableStateFlow(ManagerUiState())
    val uiState: StateFlow<ManagerUiState> = _uiState.asStateFlow()

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
            _uiState.update { it.copy(isBehaviorLoading = true) }
            try {
                val response = api.getBehavior()
                if (response.isSuccessful) {
                    val settings = response.body()?.settings
                    _uiState.update {
                        it.copy(
                            behaviorSettings = settings ?: it.behaviorSettings,
                            isBehaviorLoading = false,
                        )
                    }
                } else {
                    _uiState.update {
                        it.copy(
                            isBehaviorLoading = false,
                            error = ManagerError.BehaviorLoadFailed(response.code()),
                        )
                    }
                }
            } catch (_: Exception) {
                _uiState.update {
                    it.copy(
                        isBehaviorLoading = false,
                        error = ManagerError.Network,
                    )
                }
            }
        }
    }

    fun setProjectorLanguage(language: String) {
        val normalized = language.lowercase()
        if (normalized !in setOf("en", "fr")) return
        updateBehavior(
            status = { ManagerStatus.ProjectorLanguageChanged(it.projectorLanguage) },
            transform = { it.copy(projectorLanguage = normalized) },
        )
    }

    fun setRegion(region: String) {
        val normalized = region.lowercase()
        if (normalized !in CANADIAN_REGIONS) return
        updateBehavior { it.copy(region = normalized) }
    }

    fun setAsteroidBeltEnabled(enabled: Boolean) {
        updateBehavior { it.copy(asteroidBeltEnabled = enabled) }
    }

    fun setCometsEnabled(enabled: Boolean) {
        updateBehavior { it.copy(cometsEnabled = enabled) }
    }

    fun setCometFrequency(frequency: String) {
        val normalized = frequency.lowercase()
        if (normalized !in EVENT_FREQUENCIES) return
        updateBehavior { it.copy(cometFrequency = normalized) }
    }

    fun setFlybyAsteroidsEnabled(enabled: Boolean) {
        updateBehavior { it.copy(flybyAsteroidsEnabled = enabled) }
    }

    fun setFlybyFrequency(frequency: String) {
        val normalized = frequency.lowercase()
        if (normalized !in EVENT_FREQUENCIES) return
        updateBehavior { it.copy(flybyFrequency = normalized) }
    }

    fun setBehaviorMode(mode: String) {
        val normalized = mode.lowercase()
        if (normalized !in setOf("auto", "manual")) return
        updateBehavior { it.copy(mode = normalized) }
    }

    fun setManualTheme(theme: String) {
        val normalized = theme.lowercase()
        if (normalized !in GALAXY_THEMES) return
        updateBehavior { it.copy(manualTheme = normalized) }
    }

    fun setThemeEnabled(
        theme: String,
        enabled: Boolean,
    ) {
        val normalized = theme.lowercase()
        if (normalized !in GALAXY_THEMES || normalized == "default") return
        updateBehavior { current ->
            val themes = current.enabledThemes.toMutableSet()
            themes += "default"
            if (enabled) {
                themes += normalized
            } else {
                themes -= normalized
            }
            current.copy(enabledThemes = GALAXY_THEMES.filter { it in themes })
        }
    }

    fun setAmbientEffects(enabled: Boolean) {
        updateBehavior { it.copy(ambientEffects = enabled) }
    }

    private fun updateBehavior(
        status: ((BehaviorSettingsDto) -> ManagerStatus?)? = null,
        transform: (BehaviorSettingsDto) -> BehaviorSettingsDto,
    ) {
        val currentState = _uiState.value
        if (currentState.isBehaviorLoading || currentState.isUpdatingBehavior) return
        val updated = transform(currentState.behaviorSettings)
        if (updated == currentState.behaviorSettings) return

        viewModelScope.launch {
            _uiState.update { it.copy(isUpdatingBehavior = true, error = null) }
            try {
                val response = api.updateBehavior(updated)
                if (response.isSuccessful) {
                    val settings = response.body()?.settings ?: updated
                    _uiState.update {
                        it.copy(
                            behaviorSettings = settings,
                            isUpdatingBehavior = false,
                            status = status?.invoke(settings) ?: it.status,
                        )
                    }
                } else {
                    _uiState.update {
                        it.copy(
                            isUpdatingBehavior = false,
                            error = ManagerError.BehaviorUpdateFailed(response.code()),
                        )
                    }
                }
            } catch (_: Exception) {
                _uiState.update {
                    it.copy(
                        isUpdatingBehavior = false,
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
        private val EVENT_FREQUENCIES = setOf("rare", "normal", "frequent")
        private val CANADIAN_REGIONS =
            setOf("ca-qc", "ca-on", "ca-ab", "ca-bc", "ca-sk", "ca-nb", "ca-other")
        private val GALAXY_THEMES =
            listOf(
                "default",
                "halloween",
                "easter",
                "christmas",
                "remembrance-day",
                "canada-day",
                "fete-nationale",
                "thanksgiving",
                "new-year",
                "family-day",
            )

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
