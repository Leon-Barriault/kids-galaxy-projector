package com.kidsgalaxy.di

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.kidsgalaxy.data.remote.ApiClient
import com.kidsgalaxy.data.render.AndroidPlanetTextureRenderer
import com.kidsgalaxy.data.repository.RetrofitPlanetRepository
import com.kidsgalaxy.domain.repository.PlanetRepository
import com.kidsgalaxy.domain.usecase.SendPlanetUseCase
import com.kidsgalaxy.presentation.DrawingViewModel

/**
 * Composition root for the app.
 *
 * The single place where concrete implementations are chosen and wired to the
 * ports the domain declares. A small hand-rolled locator is proportionate here -
 * the graph is three objects deep and adding Hilt would cost more than it saves.
 */
object ServiceLocator {
    fun planetRepository(context: Context): PlanetRepository =
        RetrofitPlanetRepository(
            api = ApiClient.create(context.applicationContext),
            renderer = AndroidPlanetTextureRenderer(),
        )

    fun sendPlanetUseCase(context: Context): SendPlanetUseCase = SendPlanetUseCase(planetRepository(context))

    /**
     * Factory so Compose can obtain the ViewModel through `viewModel(factory = ...)`,
     * which keeps it scoped to the host and surviving configuration changes.
     */
    fun viewModelFactory(context: Context): ViewModelProvider.Factory {
        val appContext = context.applicationContext
        return object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                require(modelClass.isAssignableFrom(DrawingViewModel::class.java)) {
                    "Unknown ViewModel: ${modelClass.name}"
                }
                return DrawingViewModel(sendPlanetUseCase(appContext)) as T
            }
        }
    }
}
