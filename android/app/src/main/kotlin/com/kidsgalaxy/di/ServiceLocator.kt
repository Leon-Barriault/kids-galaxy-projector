package com.kidsgalaxy.di

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.kidsgalaxy.BuildConfig
import com.kidsgalaxy.data.remote.ApiClient
import com.kidsgalaxy.data.render.AndroidPlanetTextureRenderer
import com.kidsgalaxy.data.repository.RetrofitPlanetRepository
import com.kidsgalaxy.domain.repository.PlanetRepository
import com.kidsgalaxy.domain.usecase.SendPlanetUseCase
import com.kidsgalaxy.presentation.DrawingViewModel

/**
 * Composition root for the app.
 *
 * The selected galaxy URL enters here, at the outermost boundary. The drawing
 * domain and use case remain unaware of HTTP endpoints or discovery.
 */
object ServiceLocator {
    fun planetRepository(
        context: Context,
        baseUrl: String = BuildConfig.SERVER_BASE_URL,
    ): PlanetRepository =
        RetrofitPlanetRepository(
            api =
                ApiClient.create(
                    context = context.applicationContext,
                    baseUrl = baseUrl,
                ),
            renderer = AndroidPlanetTextureRenderer(),
        )

    fun sendPlanetUseCase(
        context: Context,
        baseUrl: String = BuildConfig.SERVER_BASE_URL,
    ): SendPlanetUseCase = SendPlanetUseCase(planetRepository(context, baseUrl))

    /**
     * Factory so Compose can obtain the ViewModel through `viewModel(factory = ...)`,
     * which keeps it scoped to the host and surviving configuration changes.
     */
    fun viewModelFactory(
        context: Context,
        baseUrl: String = BuildConfig.SERVER_BASE_URL,
    ): ViewModelProvider.Factory {
        val appContext = context.applicationContext
        return object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                require(modelClass.isAssignableFrom(DrawingViewModel::class.java)) {
                    "Unknown ViewModel: ${modelClass.name}"
                }
                return DrawingViewModel(sendPlanetUseCase(appContext, baseUrl)) as T
            }
        }
    }
}
