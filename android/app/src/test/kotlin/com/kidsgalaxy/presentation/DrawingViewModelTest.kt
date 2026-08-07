package com.kidsgalaxy.presentation

import com.kidsgalaxy.domain.model.CanvasSize
import com.kidsgalaxy.domain.model.Drawing
import com.kidsgalaxy.domain.model.Point
import com.kidsgalaxy.domain.repository.PlanetRepository
import com.kidsgalaxy.domain.repository.UploadRejectedException
import com.kidsgalaxy.domain.usecase.SendPlanetUseCase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * ViewModel behaviour, tested on the JVM with no emulator and no Robolectric.
 *
 * That is possible because the ViewModel depends on a use case rather than on a
 * Context: the previous version constructed its own Retrofit client, which made
 * this class untestable.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class DrawingViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    private class FakeRepository(
        var outcome: Result<Unit> = Result.success(Unit),
    ) : PlanetRepository {
        var calls = 0
        var lastName: String? = null

        override suspend fun sendPlanet(
            drawing: Drawing,
            name: String,
        ): Result<Unit> {
            calls++
            lastName = name
            return outcome
        }
    }

    private lateinit var repository: FakeRepository
    private lateinit var viewModel: DrawingViewModel

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        repository = FakeRepository()
        viewModel = DrawingViewModel(SendPlanetUseCase(repository))
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun drawOneStroke() {
        viewModel.onCanvasSizeChanged(600f, 800f)
        viewModel.startStroke(Point(0f, 0f))
        viewModel.continueStroke(Point(10f, 10f))
        viewModel.endStroke()
    }

    // -------------------- drawing --------------------

    @Test
    fun `starts with an empty drawing`() {
        assertTrue(viewModel.uiState.value.drawing.isEmpty)
        assertFalse(viewModel.uiState.value.canLaunch)
    }

    @Test
    fun `completing a stroke adds it to the drawing`() {
        drawOneStroke()
        assertEquals(1, viewModel.uiState.value.drawing.strokes.size)
        assertTrue(viewModel.uiState.value.canLaunch)
    }

    @Test
    fun `a tap does not create a stroke`() {
        viewModel.startStroke(Point(5f, 5f))
        viewModel.endStroke()
        assertTrue(viewModel.uiState.value.drawing.isEmpty)
    }

    @Test
    fun `stroke records the selected colour and width`() {
        viewModel.changeColor(0xFF2196F3.toInt())
        viewModel.changeStrokeWidth(48f)
        drawOneStroke()

        val stroke =
            viewModel.uiState.value.drawing.strokes
                .single()
        assertEquals(0xFF2196F3.toInt(), stroke.colorArgb)
        assertEquals(48f, stroke.strokeWidth, 0.001f)
    }

    @Test
    fun `undo removes the last stroke`() {
        drawOneStroke()
        drawOneStroke()
        viewModel.undo()
        assertEquals(1, viewModel.uiState.value.drawing.strokes.size)
    }

    @Test
    fun `clear empties the drawing but keeps the canvas size`() {
        drawOneStroke()
        viewModel.clear()
        assertTrue(viewModel.uiState.value.drawing.isEmpty)
        assertTrue(viewModel.uiState.value.drawing.canvasSize.isMeasured)
    }

    @Test
    fun `canvas size is recorded on the drawing`() {
        viewModel.onCanvasSizeChanged(600f, 1000f)
        assertEquals(CanvasSize(600f, 1000f), viewModel.uiState.value.drawing.canvasSize)
    }

    @Test
    fun `zero canvas size is ignored`() {
        viewModel.onCanvasSizeChanged(0f, 0f)
        assertFalse(viewModel.uiState.value.drawing.canvasSize.isMeasured)
    }

    // -------------------- sending --------------------

    @Test
    fun `launching an empty drawing shows an error and sends nothing`() =
        runTest {
            viewModel.sendPlanet("My Planet")
            advanceUntilIdle()

            assertEquals(0, repository.calls)
            assertNotNull(viewModel.uiState.value.errorMessage)
            assertFalse(viewModel.uiState.value.isSending)
        }

    @Test
    fun `successful launch shows the celebration`() =
        runTest {
            drawOneStroke()
            viewModel.sendPlanet("Sparkle World")
            advanceUntilIdle()

            assertEquals(1, repository.calls)
            assertEquals("Sparkle World", repository.lastName)
            assertTrue(viewModel.uiState.value.showSuccess)
            assertFalse(viewModel.uiState.value.isSending)
            assertNull(viewModel.uiState.value.errorMessage)
        }

    @Test
    fun `failed launch surfaces an error and clears the sending flag`() =
        runTest {
            repository.outcome = Result.failure(RuntimeException("no network"))
            drawOneStroke()
            viewModel.sendPlanet("Doomed World")
            advanceUntilIdle()

            assertNotNull(viewModel.uiState.value.errorMessage)
            assertFalse(viewModel.uiState.value.isSending)
            assertFalse(viewModel.uiState.value.showSuccess)
        }

    @Test
    fun `double tap on launch only sends once`() =
        runTest {
            drawOneStroke()
            viewModel.sendPlanet("Once")
            viewModel.sendPlanet("Twice") // while the first is still in flight
            advanceUntilIdle()

            assertEquals(1, repository.calls)
        }

    @Test
    fun `error can be dismissed`() =
        runTest {
            viewModel.sendPlanet("") // empty drawing -> error
            advanceUntilIdle()
            assertNotNull(viewModel.uiState.value.errorMessage)

            viewModel.clearError()
            assertNull(viewModel.uiState.value.errorMessage)
        }

    @Test
    fun `success can be dismissed`() =
        runTest {
            drawOneStroke()
            viewModel.sendPlanet("World")
            advanceUntilIdle()
            assertTrue(viewModel.uiState.value.showSuccess)

            viewModel.dismissSuccess()
            assertFalse(viewModel.uiState.value.showSuccess)
        }

    @Test
    fun `rate limited response explains the wait in kid-friendly words`() =
        runTest {
            repository.outcome = Result.failure(UploadRejectedException(429))
            drawOneStroke()
            viewModel.sendPlanet("Too Fast")
            advanceUntilIdle()

            val message = viewModel.uiState.value.errorMessage
            assertNotNull(message)
            assertTrue("should mention slowing down: $message", message!!.contains("Slow down"))
        }

    @Test
    fun `server error is reported as a hiccup`() =
        runTest {
            repository.outcome = Result.failure(UploadRejectedException(503))
            drawOneStroke()
            viewModel.sendPlanet("Broken")
            advanceUntilIdle()

            assertTrue(
                viewModel.uiState.value.errorMessage!!
                    .contains("hiccup"),
            )
        }

    @Test
    fun `unknown status code still surfaces the number`() =
        runTest {
            repository.outcome = Result.failure(UploadRejectedException(418))
            drawOneStroke()
            viewModel.sendPlanet("Teapot")
            advanceUntilIdle()

            assertTrue(
                viewModel.uiState.value.errorMessage!!
                    .contains("418"),
            )
        }

    @Test
    fun `network failure suggests checking the wifi`() =
        runTest {
            repository.outcome = Result.failure(java.io.IOException("unreachable"))
            drawOneStroke()
            viewModel.sendPlanet("Offline")
            advanceUntilIdle()

            assertTrue(
                viewModel.uiState.value.errorMessage!!
                    .contains("KidsGalaxy Wi-Fi"),
            )
        }

    @Test
    fun `starting a new planet resets the canvas`() =
        runTest {
            drawOneStroke()
            viewModel.sendPlanet("World")
            advanceUntilIdle()

            viewModel.startNewPlanet()

            assertTrue(viewModel.uiState.value.drawing.isEmpty)
            assertFalse(viewModel.uiState.value.showSuccess)
        }
}
