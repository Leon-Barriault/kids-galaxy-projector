package com.kidsgalaxy.domain.gate

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

/**
 * The gate has to stop a 3-to-6-year-old who is tapping at random.
 * A short hold does not open it, and the sum is a two-digit answer.
 */
class AdultGateTest {
    private val sum = AdultSum(left = 6, right = 7)
    private val answer = "13"

    @Test
    fun `sums use two digits so one tap cannot be the answer`() {
        repeat(100) { seed ->
            val generated = AdultSum.random(Random(seed))
            assertTrue(generated.left in AdultSum.ADDEND_RANGE)
            assertTrue(generated.right in AdultSum.ADDEND_RANGE)
            assertEquals(2, generated.answerText.length)
            assertTrue(generated.answer in 10..18)
        }
    }

    @Test
    fun `a hold shorter than the policy does not open the gate`() {
        assertFalse(AdultGatePolicy.holdGranted(AdultGatePolicy.HOLD_MILLIS - 1))
        assertTrue(AdultGatePolicy.holdGranted(AdultGatePolicy.HOLD_MILLIS))
        assertTrue(AdultGatePolicy.HOLD_MILLIS > 400L)
    }

    @Test
    fun `one digit does not unlock`() {
        val state = AdultGateState.started(sum).pressDigit(1, now = 0L)
        assertEquals("1", state.entered)
        assertFalse(state.unlocked)
        assertTrue(state.phase(0L) is AdultGatePhase.Entering)
    }

    @Test
    fun `the correct sum unlocks`() {
        val state = enter(AdultGateState.started(sum), answer)
        assertTrue(state.unlocked)
        assertTrue(state.phase(0L) is AdultGatePhase.Unlocked)
    }

    @Test
    fun `a wrong two-digit answer does not unlock`() {
        val state = enter(AdultGateState.started(sum), "14")
        assertFalse(state.unlocked)
        assertEquals("", state.entered)
        assertTrue(state.lastAttemptWrong)
        assertEquals(1, state.wrongAnswers)
    }

    @Test
    fun `three wrong answers lock the gate`() {
        var state = AdultGateState.started(sum)
        repeat(AdultGatePolicy.MAX_WRONG_ANSWERS) {
            state = enter(state, "99")
        }
        val phase = state.phase(0L)
        assertTrue(phase is AdultGatePhase.Locked)
        assertEquals(AdultGatePolicy.LOCKOUT_MILLIS, (phase as AdultGatePhase.Locked).untilEpochMillis)
        assertFalse(state.unlocked)
    }

    @Test
    fun `digits during the lock are ignored`() {
        var state = AdultGateState.started(sum)
        repeat(AdultGatePolicy.MAX_WRONG_ANSWERS) {
            state = enter(state, "99")
        }
        val locked = state.pressDigit(1, now = 1L).pressDigit(3, now = 2L)
        assertEquals(state, locked)
        assertFalse(locked.unlocked)
    }

    @Test
    fun `the correct sum works after the lock expires`() {
        var state = AdultGateState.started(sum)
        repeat(AdultGatePolicy.MAX_WRONG_ANSWERS) {
            state = enter(state, "99")
        }
        val afterLock = enter(state, answer, now = AdultGatePolicy.LOCKOUT_MILLIS)
        assertTrue(afterLock.unlocked)
    }

    @Test
    fun `backspace removes only the last digit`() {
        val started = AdultGateState.started(sum).pressDigit(1, now = 0L)
        val cleared = started.pressBackspace(now = 1L)
        assertEquals("", cleared.entered)
        assertEquals(cleared, cleared.pressBackspace(now = 2L))
    }

    @Test
    fun `digits outside zero to nine are ignored`() {
        val started = AdultGateState.started(sum)
        assertEquals(started, started.pressDigit(-1, now = 0L))
        assertEquals(started, started.pressDigit(10, now = 0L))
    }

    @Test
    fun `random two-digit guesses unlock only when they are the answer`() {
        var luckyHits = 0
        repeat(300) { seed ->
            val random = Random(seed)
            val guess = "${random.nextInt(0, 10)}${random.nextInt(0, 10)}"
            val state = enter(AdultGateState.started(sum), guess)
            if (state.unlocked) {
                assertEquals(answer, guess)
                luckyHits += 1
            }
        }
        assertTrue(luckyHits < 20)
    }

    private fun enter(
        start: AdultGateState,
        digits: String,
        now: Long = 0L,
    ): AdultGateState {
        var state = start
        digits.forEach { character ->
            state = state.pressDigit(character.digitToInt(), now)
        }
        return state
    }
}
