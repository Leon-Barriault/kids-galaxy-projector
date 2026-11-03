package com.kidsgalaxy.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kidsgalaxy.R
import com.kidsgalaxy.domain.gate.AdultGatePhase
import com.kidsgalaxy.domain.gate.AdultGateState
import kotlinx.coroutines.delay

@Composable
fun AdultGateDialog(
    state: AdultGateState,
    nowEpochMillis: Long,
    onStateChange: (AdultGateState) -> Unit,
    onNowChange: (Long) -> Unit,
    onToggleLanguage: () -> Unit,
    onConfigureGalaxy: () -> Unit,
    onDismiss: () -> Unit,
) {
    val phase = state.phase(nowEpochMillis)
    if (phase is AdultGatePhase.Locked) {
        LaunchedEffect(phase.untilEpochMillis) {
            val wait = phase.untilEpochMillis - System.currentTimeMillis()
            if (wait > 0L) {
                delay(wait)
            }
            onNowChange(System.currentTimeMillis())
        }
    }
    val unlocked = phase is AdultGatePhase.Unlocked
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                stringResource(
                    if (unlocked) R.string.adult_menu_title else R.string.adult_gate_title,
                ),
            )
        },
        text = {
            if (unlocked) {
                AdultMenu(
                    onToggleLanguage = onToggleLanguage,
                    onConfigureGalaxy = onConfigureGalaxy,
                )
            } else {
                AdultKeypad(
                    state = state,
                    locked = phase is AdultGatePhase.Locked,
                    onStateChange = onStateChange,
                    onNowChange = onNowChange,
                )
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text(
                    stringResource(
                        if (unlocked) R.string.adult_menu_close else R.string.adult_gate_cancel,
                    ),
                )
            }
        },
    )
}

@Composable
private fun AdultMenu(
    onToggleLanguage: () -> Unit,
    onConfigureGalaxy: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Button(
            onClick = onToggleLanguage,
            modifier =
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp),
        ) {
            Text(stringResource(R.string.adult_menu_language), fontSize = 18.sp)
        }
        Button(
            onClick = onConfigureGalaxy,
            modifier =
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp),
        ) {
            Text(stringResource(R.string.adult_menu_galaxy), fontSize = 18.sp)
        }
    }
}

@Composable
private fun AdultKeypad(
    state: AdultGateState,
    locked: Boolean,
    onStateChange: (AdultGateState) -> Unit,
    onNowChange: (Long) -> Unit,
) {
    val answerLabel =
        if (state.entered.isEmpty()) {
            stringResource(R.string.adult_gate_answer_empty)
        } else {
            stringResource(R.string.adult_gate_answer_entered, state.entered)
        }
    val deleteLabel = stringResource(R.string.adult_gate_delete)
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(
            stringResource(R.string.adult_gate_prompt, state.sum.left, state.sum.right),
            fontSize = 32.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
        Text(
            text = state.entered.ifEmpty { " " },
            fontSize = 40.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            modifier =
                Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = answerLabel },
        )
        if (locked) {
            Text(stringResource(R.string.adult_gate_locked))
        } else if (state.lastAttemptWrong) {
            Text(stringResource(R.string.adult_gate_wrong))
        }
        val rows =
            listOf(
                listOf(1, 2, 3),
                listOf(4, 5, 6),
                listOf(7, 8, 9),
            )
        rows.forEach { row ->
            DigitRow(
                digits = row,
                enabled = !locked,
                state = state,
                onStateChange = onStateChange,
                onNowChange = onNowChange,
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Spacer(
                modifier =
                    Modifier
                        .weight(1f)
                        .height(64.dp),
            )
            DigitButton(
                digit = 0,
                enabled = !locked,
                modifier = Modifier.weight(1f),
                onPress = {
                    val now = System.currentTimeMillis()
                    onNowChange(now)
                    onStateChange(state.pressDigit(0, now))
                },
            )
            OutlinedButton(
                onClick = {
                    val now = System.currentTimeMillis()
                    onNowChange(now)
                    onStateChange(state.pressBackspace(now))
                },
                enabled = !locked,
                modifier =
                    Modifier
                        .weight(1f)
                        .height(64.dp)
                        .semantics { contentDescription = deleteLabel },
            ) {
                Text("⌫", fontSize = 22.sp)
            }
        }
    }
}

@Composable
private fun DigitRow(
    digits: List<Int>,
    enabled: Boolean,
    state: AdultGateState,
    onStateChange: (AdultGateState) -> Unit,
    onNowChange: (Long) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        digits.forEach { digit ->
            DigitButton(
                digit = digit,
                enabled = enabled,
                modifier = Modifier.weight(1f),
                onPress = {
                    val now = System.currentTimeMillis()
                    onNowChange(now)
                    onStateChange(state.pressDigit(digit, now))
                },
            )
        }
    }
}

@Composable
private fun DigitButton(
    digit: Int,
    enabled: Boolean,
    modifier: Modifier,
    onPress: () -> Unit,
) {
    OutlinedButton(
        onClick = onPress,
        enabled = enabled,
        modifier = modifier.height(64.dp),
    ) {
        Text(digit.toString(), fontSize = 22.sp, fontWeight = FontWeight.Bold)
    }
}
