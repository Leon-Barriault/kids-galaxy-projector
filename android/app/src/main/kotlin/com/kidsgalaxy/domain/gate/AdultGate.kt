package com.kidsgalaxy.domain.gate

import kotlin.random.Random

/**
 * A grown-up check that a young child does not pass by tapping.
 *
 * The hold is long on purpose. The sum is always two digits, from addends
 * 5 through 9, so one tap is never the answer. Three wrong answers lock
 * the keypad for a short time.
 */
data class AdultSum(
    val left: Int,
    val right: Int,
) {
    init {
        require(left in ADDEND_RANGE) { "left addend out of range" }
        require(right in ADDEND_RANGE) { "right addend out of range" }
    }

    val answer: Int
        get() = left + right

    val answerText: String
        get() = answer.toString()

    companion object {
        const val ADDEND_MIN = 5
        const val ADDEND_MAX = 9
        val ADDEND_RANGE: IntRange = ADDEND_MIN..ADDEND_MAX

        fun random(random: Random = Random.Default): AdultSum =
            AdultSum(
                left = random.nextInt(ADDEND_MIN, ADDEND_MAX + 1),
                right = random.nextInt(ADDEND_MIN, ADDEND_MAX + 1),
            )
    }
}

object AdultGatePolicy {
    /** Longer than a child's poke. TalkBack uses the accessibility action. */
    const val HOLD_MILLIS = 1_200L
    const val MAX_WRONG_ANSWERS = 3
    const val LOCKOUT_MILLIS = 30_000L

    fun holdGranted(elapsedMillis: Long): Boolean = elapsedMillis >= HOLD_MILLIS
}

sealed interface AdultGatePhase {
    data object Entering : AdultGatePhase

    data object Unlocked : AdultGatePhase

    data class Locked(
        val untilEpochMillis: Long,
    ) : AdultGatePhase
}

data class AdultGateState(
    val sum: AdultSum,
    val entered: String = "",
    val wrongAnswers: Int = 0,
    val lockedUntilEpochMillis: Long? = null,
    val unlocked: Boolean = false,
    val lastAttemptWrong: Boolean = false,
) {
    fun phase(nowEpochMillis: Long): AdultGatePhase {
        if (unlocked) {
            return AdultGatePhase.Unlocked
        }
        val until = lockedUntilEpochMillis
        if (until != null && nowEpochMillis < until) {
            return AdultGatePhase.Locked(until)
        }
        return AdultGatePhase.Entering
    }

    fun pressDigit(
        digit: Int,
        nowEpochMillis: Long,
    ): AdultGateState {
        if (digit !in 0..9 || phase(nowEpochMillis) != AdultGatePhase.Entering) {
            return this
        }
        val active = clearExpiredLock(nowEpochMillis).copy(lastAttemptWrong = false)
        val next = active.entered + digit.toString()
        if (next.length < sum.answerText.length) {
            return active.copy(entered = next)
        }
        if (next == sum.answerText) {
            return active.copy(entered = next, unlocked = true)
        }
        val failures = active.wrongAnswers + 1
        if (failures >= AdultGatePolicy.MAX_WRONG_ANSWERS) {
            return active.copy(
                entered = "",
                wrongAnswers = 0,
                lockedUntilEpochMillis = nowEpochMillis + AdultGatePolicy.LOCKOUT_MILLIS,
                lastAttemptWrong = true,
            )
        }
        return active.copy(
            entered = "",
            wrongAnswers = failures,
            lastAttemptWrong = true,
        )
    }

    fun pressBackspace(nowEpochMillis: Long): AdultGateState {
        if (phase(nowEpochMillis) != AdultGatePhase.Entering) {
            return this
        }
        val active = clearExpiredLock(nowEpochMillis)
        if (active.entered.isEmpty()) {
            return active
        }
        return active.copy(entered = active.entered.dropLast(1), lastAttemptWrong = false)
    }

    private fun clearExpiredLock(nowEpochMillis: Long): AdultGateState {
        val until = lockedUntilEpochMillis ?: return this
        if (nowEpochMillis < until) {
            return this
        }
        return copy(lockedUntilEpochMillis = null)
    }

    companion object {
        fun started(sum: AdultSum): AdultGateState = AdultGateState(sum = sum)
    }
}
