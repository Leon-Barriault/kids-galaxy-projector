package com.kidsgalaxy.viewmodel

import android.content.Context
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kidsgalaxy.data.DrawingUiState
import com.kidsgalaxy.data.StrokePath
import com.kidsgalaxy.network.PlanetApi
import com.kidsgalaxy.utils.renderStrokesToBitmap
import com.kidsgalaxy.utils.saveToCache
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

class DrawingViewModel : ViewModel() {

    private val _uiState = MutableStateFlow(DrawingUiState())
    val uiState = _uiState.asStateFlow()

    private var api: PlanetApi? = null
    private var currentPoints = mutableListOf<Offset>()

    // -------------------- Public API --------------------

    fun initApi(baseUrl: String) {
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }

        val client = OkHttpClient.Builder()
            .connectTimeout(8, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .addInterceptor(logging)
            .build()

        val retrofit = Retrofit.Builder()
            .baseUrl(baseUrl.trimEnd('/') + "/")
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()

        api = retrofit.create(PlanetApi::class.java)
    }

    fun changeColor(color: Color) {
        _uiState.update { it.copy(currentColor = color) }
    }

    fun changeStrokeWidth(width: Float) {
        _uiState.update { it.copy(currentStrokeWidth = width) }
    }

    fun startStroke(offset: Offset) {
        currentPoints = mutableListOf(offset)
    }

    fun continueStroke(offset: Offset) {
        currentPoints.add(offset)
    }

    fun endStroke() {
        if (currentPoints.size >= 2) {
            val stroke = StrokePath(
                points = currentPoints.toList(),
                color = _uiState.value.currentColor,
                strokeWidth = _uiState.value.currentStrokeWidth
            )
            _uiState.update { it.copy(strokes = it.strokes + stroke) }
        }
        currentPoints.clear()
    }

    fun undo() {
        _uiState.update {
            if (it.strokes.isNotEmpty()) it.copy(strokes = it.strokes.dropLast(1))
            else it
        }
    }

    fun clear() {
        _uiState.update { it.copy(strokes = emptyList()) }
    }

    fun dismissSuccess() {
        _uiState.update { it.copy(showSuccess = false) }
    }

    fun sendPlanet(context: Context, planetName: String) {
        val currentApi = api
        if (currentApi == null) {
            _uiState.update { it.copy(lastError = "Server not configured") }
            return
        }
        if (_uiState.value.strokes.isEmpty()) {
            _uiState.update { it.copy(lastError = "Draw something first!") }
            return
        }

        _uiState.update { it.copy(isSending = true, lastError = null) }

        viewModelScope.launch {
            try {
                val bitmap = renderStrokesToBitmap(_uiState.value.strokes)
                val file = bitmap.saveToCache(context)

                val requestFile = file.asRequestBody("image/png".toMediaType())
                val body = MultipartBody.Part.createFormData("file", "planet.png", requestFile)
                val nameBody = planetName.ifBlank { "My Planet" }
                    .toRequestBody("text/plain".toMediaType())

                val response = currentApi.uploadPlanet(body, nameBody)

                if (response.isSuccessful) {
                    _uiState.update {
                        it.copy(
                            isSending = false,
                            showSuccess = true,
                            lastError = null
                        )
                    }
                } else {
                    _uiState.update {
                        it.copy(
                            isSending = false,
                            lastError = "Could not send planet (${response.code()})"
                        )
                    }
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isSending = false,
                        lastError = e.message ?: "Network error – is the tablet connected to KidsGalaxy Wi-Fi?"
                    )
                }
            }
        }
    }
}
