package com.kidsgalaxy.ui

import android.os.SystemClock
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onLongClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.kidsgalaxy.domain.gate.AdultGatePolicy
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * A control that ignores a tap. The grown-up holds it, or uses the
 * TalkBack action, and then still has to pass the number check.
 */
@Composable
fun AdultHoldTarget(
    holdLabel: String,
    onGranted: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val granted by rememberUpdatedState(onGranted)
    var progress by remember { mutableFloatStateOf(0f) }
    Box(
        modifier =
            modifier
                .heightIn(min = 48.dp)
                .semantics {
                    role = Role.Button
                    contentDescription = holdLabel
                    onLongClick(label = holdLabel) {
                        granted()
                        true
                    }
                }.pointerInput(Unit) {
                    detectTapGestures(
                        onPress = {
                            coroutineScope {
                                val job =
                                    launch {
                                        val start = SystemClock.uptimeMillis()
                                        while (isActive) {
                                            val elapsed = SystemClock.uptimeMillis() - start
                                            progress =
                                                (elapsed.toFloat() / AdultGatePolicy.HOLD_MILLIS)
                                                    .coerceIn(0f, 1f)
                                            if (AdultGatePolicy.holdGranted(elapsed)) {
                                                progress = 0f
                                                granted()
                                                return@launch
                                            }
                                            delay(32)
                                        }
                                    }
                                tryAwaitRelease()
                                job.cancel()
                                progress = 0f
                            }
                        },
                    )
                },
        contentAlignment = Alignment.Center,
    ) {
        content()
        if (progress > 0f) {
            Box(
                modifier =
                    Modifier
                        .align(Alignment.BottomStart)
                        .fillMaxWidth(progress)
                        .height(4.dp)
                        .background(MaterialTheme.colorScheme.primary)
                        .clearAndSetSemantics { },
            )
        }
    }
}
