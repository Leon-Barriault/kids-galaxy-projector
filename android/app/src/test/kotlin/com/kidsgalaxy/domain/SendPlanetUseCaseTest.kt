package com.kidsgalaxy.domain

import com.kidsgalaxy.domain.model.Drawing
import com.kidsgalaxy.domain.model.Point
import com.kidsgalaxy.domain.model.StrokePath
import com.kidsgalaxy.domain.repository.PlanetRepository
import com.kidsgalaxy.domain.usecase.SendPlanetResult
import com.kidsgalaxy.domain.usecase.SendPlanetUseCase
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Upload orchestration, verified with a fake repository.
 *
 * No Retrofit, no OkHttp, no Android framework - so the rules around empty
 * drawings, blank names and failure mapping are checked in milliseconds.
 */
class SendPlanetUseCaseTest {

    private fun drawingWithOneStroke() =
        Drawing().addStroke(
            StrokePath(
                points = listOf(Point(0f, 0f), Point(10f, 10f)),
                colorArgb = 0xFFE53935.toInt(),
                strokeWidth = 28f,
            ),
        )

    private class FakeRepository(
        private val outcome: Result<Unit> = Result.success(Unit),
    ) : PlanetRepository {
        var calls = 0
        var lastName: String? = null
        var lastDrawing: Drawing? = null

        override suspend fun sendPlanet(drawing: Drawing, name: String): Result<Unit> {
            calls++
            lastName = name
            lastDrawing = drawing
            return outcome
        }
    }

    @Test
    fun `refuses to send an empty drawing`() = runTest {
        val repository = FakeRepository()
        val result = SendPlanetUseCase(repository).invoke(Drawing(), "My Planet")

        assertTrue(result is SendPlanetResult.NothingDrawn)
        assertEquals("no network call should be made", 0, repository.calls)
    }

    @Test
    fun `sends a drawing with strokes`() = runTest {
        val repository = FakeRepository()
        val result = SendPlanetUseCase(repository).invoke(drawingWithOneStroke(), "Sparkle")

        assertTrue(result is SendPlanetResult.Success)
        assertEquals(1, repository.calls)
        assertEquals("Sparkle", repository.lastName)
    }

    @Test
    fun `blank name falls back to a friendly default`() = runTest {
        val repository = FakeRepository()
        SendPlanetUseCase(repository).invoke(drawingWithOneStroke(), "   ")
        assertEquals("My Planet", repository.lastName)
    }

    @Test
    fun `name is trimmed`() = runTest {
        val repository = FakeRepository()
        SendPlanetUseCase(repository).invoke(drawingWithOneStroke(), "  Sparkle World  ")
        assertEquals("Sparkle World", repository.lastName)
    }

    @Test
    fun `punctuation in the name is preserved for the projector`() = runTest {
        val repository = FakeRepository()
        SendPlanetUseCase(repository).invoke(drawingWithOneStroke(), "Alice's World!")
        assertEquals("Alice's World!", repository.lastName)
    }

    @Test
    fun `repository failure is reported as a failure result`() = runTest {
        val repository = FakeRepository(Result.failure(RuntimeException("boom")))
        val result = SendPlanetUseCase(repository).invoke(drawingWithOneStroke(), "X")
        assertTrue(result is SendPlanetResult.Failed)
    }
}
