package com.kidsgalaxy.presentation

import com.kidsgalaxy.domain.model.Drawing
import com.kidsgalaxy.domain.model.PlanetDesign
import com.kidsgalaxy.domain.repository.PlanetRepository
import com.kidsgalaxy.domain.usecase.SendPlanetUseCase
import org.junit.Assert.assertEquals
import org.junit.Test

class DrawingFeatureColorTest {
    private val repository =
        object : PlanetRepository {
            override suspend fun sendPlanet(
                drawing: Drawing,
                name: String,
            ): Result<Unit> = Result.success(Unit)

            override suspend fun sendPlanet(
                drawing: Drawing,
                name: String,
                design: PlanetDesign,
            ): Result<Unit> = Result.success(Unit)
        }

    @Test
    fun `ring crater and mountain colors are independent choices`() {
        val viewModel = DrawingViewModel(SendPlanetUseCase(repository))

        viewModel.changeRingColor(0xFF4FC3F7.toInt())
        viewModel.changeCraterColor(0xFFAB47BC.toInt())
        viewModel.changeMountainColor(0xFF66BB6A.toInt())

        val state = viewModel.uiState.value
        assertEquals(0xFF4FC3F7.toInt(), state.ringColorArgb)
        assertEquals(0xFFAB47BC.toInt(), state.craterColorArgb)
        assertEquals(0xFF66BB6A.toInt(), state.mountainColorArgb)
        assertEquals(state.ringColorArgb, state.design.ringColorArgb)
        assertEquals(state.craterColorArgb, state.design.craterColorArgb)
        assertEquals(state.mountainColorArgb, state.design.mountainColorArgb)
    }
}
