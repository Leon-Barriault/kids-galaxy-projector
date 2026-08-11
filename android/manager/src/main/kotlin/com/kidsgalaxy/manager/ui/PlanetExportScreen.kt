package com.kidsgalaxy.manager.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.print.PrintManager
import android.util.Log
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Row
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Print
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.print.PrintHelper
import com.kidsgalaxy.connection.GalaxyTarget
import com.kidsgalaxy.manager.R
import com.kidsgalaxy.manager.data.PlanetDto
import com.kidsgalaxy.manager.data.PlanetExportClient
import com.kidsgalaxy.manager.data.PlanetExportHttpException
import com.kidsgalaxy.manager.data.PlanetExportPayloadException
import kotlinx.coroutines.launch
import java.io.IOException

private const val EXPORT_LOG_TAG = "KidsGalaxyExport"
private const val ANDROID_PRINT_FEATURE = "android.software.print"

private enum class PrintFailureStage {
    INVALID_IMAGE,
    UNAVAILABLE,
    LAUNCH,
}

private class PrintStageException(
    val stage: PrintFailureStage,
    message: String,
    cause: Throwable? = null,
) : IllegalStateException(message, cause)

@Composable
fun PlanetExportActions(
    planet: PlanetDto,
    galaxy: GalaxyTarget,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val client = remember(galaxy.baseUrl) { PlanetExportClient(context, galaxy.baseUrl) }
    var pendingPrintSheet by remember { mutableStateOf<ByteArray?>(null) }
    var pendingPrintFailureDetail by remember { mutableStateOf<String?>(null) }
    var pendingStl by remember { mutableStateOf<ByteArray?>(null) }

    val printFallbackLauncher =
        rememberLauncherForActivityResult(
            ActivityResultContracts.CreateDocument("image/png"),
        ) { uri ->
            val bytes = pendingPrintSheet
            val failureDetail = pendingPrintFailureDetail
            if (uri != null && bytes != null) {
                try {
                    writeExportDocument(context, uri, bytes)
                    Toast
                        .makeText(
                            context,
                            context.getString(R.string.print_fallback_saved),
                            Toast.LENGTH_LONG,
                        ).show()
                } catch (error: Exception) {
                    showExportError(context, error)
                }
            } else if (failureDetail != null) {
                Toast
                    .makeText(
                        context,
                        context.getString(R.string.print_start_failed, failureDetail),
                        Toast.LENGTH_LONG,
                    ).show()
            }
            pendingPrintSheet = null
            pendingPrintFailureDetail = null
        }

    val stlLauncher =
        rememberLauncherForActivityResult(
            ActivityResultContracts.CreateDocument("model/stl"),
        ) { uri ->
            val bytes = pendingStl
            if (uri != null && bytes != null) {
                try {
                    writeExportDocument(context, uri, bytes)
                } catch (error: Exception) {
                    showExportError(context, error)
                }
            }
            pendingStl = null
        }

    Row(verticalAlignment = Alignment.CenterVertically) {
        IconButton(
            onClick = {
                scope.launch {
                    try {
                        val bytes = client.printSheet(planet.id)
                        val bitmap =
                            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                                ?: throw PrintStageException(
                                    PrintFailureStage.INVALID_IMAGE,
                                    "Android could not decode the print PNG",
                                )
                        try {
                            startAndroidPrint(
                                context = context,
                                jobName = "${planet.name} - Kids Galaxy",
                                bitmap = bitmap,
                            )
                        } catch (error: PrintStageException) {
                            if (error.stage != PrintFailureStage.LAUNCH) {
                                throw error
                            }

                            val detail = error.diagnosticDetail()
                            Log.e(EXPORT_LOG_TAG, "Android print dialog failed", error)
                            pendingPrintSheet = bytes
                            pendingPrintFailureDetail = detail
                            Toast
                                .makeText(
                                    context,
                                    context.getString(R.string.print_start_failed_saving, detail),
                                    Toast.LENGTH_LONG,
                                ).show()
                            try {
                                printFallbackLauncher.launch(printSheetFilename(planet))
                            } catch (fallbackError: RuntimeException) {
                                pendingPrintSheet = null
                                pendingPrintFailureDetail = null
                                Log.e(EXPORT_LOG_TAG, "Print fallback picker failed", fallbackError)
                                showExportError(context, error)
                            }
                        }
                    } catch (error: Exception) {
                        showExportError(context, error)
                    }
                }
            },
        ) {
            Icon(
                Icons.Default.Print,
                contentDescription = stringResource(R.string.print_planet),
            )
        }
        IconButton(
            onClick = {
                scope.launch {
                    try {
                        pendingStl = client.stl(planet.id)
                        stlLauncher.launch(stlFilename(planet))
                    } catch (error: Exception) {
                        pendingStl = null
                        showExportError(context, error)
                    }
                }
            },
        ) {
            Icon(
                Icons.Default.Download,
                contentDescription = stringResource(R.string.download_stl),
            )
        }
    }
}

/**
 * Android's PrintManager rejects calls that were not created from an Activity
 * context. Compose's LocalContext may be a ContextWrapper, so always unwrap it
 * before constructing PrintHelper instead of relying on the current wrapper.
 */
private fun startAndroidPrint(
    context: Context,
    jobName: String,
    bitmap: Bitmap,
) {
    val activity =
        context.findActivity()
            ?: throw PrintStageException(
                PrintFailureStage.UNAVAILABLE,
                "No active Activity is available for Android printing",
            )

    if (!activity.packageManager.hasSystemFeature(ANDROID_PRINT_FEATURE)) {
        throw PrintStageException(
            PrintFailureStage.UNAVAILABLE,
            "This Android build does not provide the print framework",
        )
    }
    if (activity.getSystemService(Context.PRINT_SERVICE) !is PrintManager) {
        throw PrintStageException(
            PrintFailureStage.UNAVAILABLE,
            "Android print service is unavailable",
        )
    }

    try {
        PrintHelper(activity).apply {
            scaleMode = PrintHelper.SCALE_MODE_FIT
            colorMode = PrintHelper.COLOR_MODE_COLOR
            printBitmap(jobName, bitmap)
        }
    } catch (error: RuntimeException) {
        throw PrintStageException(
            PrintFailureStage.LAUNCH,
            error.message ?: error.javaClass.simpleName,
            error,
        )
    }
}

private fun Context.findActivity(): Activity? {
    var current: Context? = this
    while (current is ContextWrapper) {
        if (current is Activity) return current
        val base = current.baseContext
        if (base === current) break
        current = base
    }
    return current as? Activity
}

private fun PrintStageException.diagnosticDetail(): String {
    val source = cause ?: this
    val message = source.message?.trim().orEmpty()
    return if (message.isBlank()) {
        source.javaClass.simpleName
    } else {
        "${source.javaClass.simpleName}: ${message.take(180)}"
    }
}

private fun writeExportDocument(
    context: Context,
    uri: Uri,
    bytes: ByteArray,
) {
    val output = context.contentResolver.openOutputStream(uri)
    if (output == null) {
        error("Could not open export document")
    }
    output.use { stream -> stream.write(bytes) }
}

private fun showExportError(
    context: Context,
    error: Exception,
) {
    Log.e(EXPORT_LOG_TAG, "Planet export failed", error)
    val message =
        when (error) {
            is PlanetExportHttpException ->
                context.getString(R.string.export_server_failed, error.statusCode)
            is PlanetExportPayloadException ->
                context.getString(R.string.export_payload_invalid, error.exportName)
            is PrintStageException ->
                when (error.stage) {
                    PrintFailureStage.INVALID_IMAGE ->
                        context.getString(R.string.print_invalid_image)
                    PrintFailureStage.UNAVAILABLE ->
                        context.getString(R.string.print_unavailable)
                    PrintFailureStage.LAUNCH ->
                        context.getString(
                            R.string.print_start_failed,
                            error.diagnosticDetail(),
                        )
                }
            is IOException ->
                context.getString(R.string.export_network_failed)
            else ->
                context.getString(
                    R.string.export_failed_diagnostic,
                    error.javaClass.simpleName,
                )
        }
    Toast.makeText(context, message, Toast.LENGTH_LONG).show()
}

private fun printSheetFilename(planet: PlanetDto): String = "${safePlanetName(planet)}_${planet.id}_print.png"

private fun stlFilename(planet: PlanetDto): String = "${safePlanetName(planet)}_${planet.id}.stl"

private fun safePlanetName(planet: PlanetDto): String =
    planet.name
        .trim()
        .replace(Regex("[^A-Za-z0-9._-]+"), "_")
        .trim('_')
        .ifBlank { "planet" }
