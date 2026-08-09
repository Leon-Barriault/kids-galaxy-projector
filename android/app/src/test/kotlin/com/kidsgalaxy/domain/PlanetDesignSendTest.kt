package com.kidsgalaxy.domain

import com.kidsgalaxy.domain.model.Drawing
import com.kidsgalaxy.domain.model.PlanetCompanion
import com.kidsgalaxy.domain.model.PlanetDesign
import com.kidsgalaxy.domain.model.PlanetStyle
import com.kidsgalaxy.domain.model.Point
import com.kidsgalaxy.domain.model.StrokePath
import com.kidsgalaxy.domain.repository.PlanetRepository
import com.kidsgalaxy.domain.usecase.SendPlanetUseCase
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class PlanetDesignSendTest {
    @Test
    fun `selected style and companions reach repository`() =
        runTest {
            var received: PlanetDesign? = null
            val repository =
                object : PlanetRepository {
                    override suspend fun sendPlanet(
                        drawing: Drawing,
                        name: String,
                    ): Result<Unit> = Result.success(Unit)

                    override suspend fun sendPlanet(
                        drawing: Drawing,
                        name: String,
                        design: PlanetDesign,
                    ): Result<Unit> {
                        received = design
                        return Result.success(Unit)
                    }
                }
            val drawing =
                Drawing().addStroke(
                    StrokePath(
                        points = listOf(Point(1f, 1f), Point(2f, 2f)),
                        colorArgb = 0xFF2196F3.toInt(),
                        strokeWidth = 28f,
                    ),
                )
            val design =
                PlanetDesign(
                    style = PlanetStyle.SPIKY,
                    companions = setOf(PlanetCompanion.MOON, PlanetCompanion.ASTRONAUT),
                )

            SendPlanetUseCase(repository)(drawing, "Peaks", design)

            assertEquals(design, received)
        }
}
