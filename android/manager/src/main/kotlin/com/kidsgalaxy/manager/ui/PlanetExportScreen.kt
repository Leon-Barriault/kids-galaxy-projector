package com.kidsgalaxy.manager.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.net.Uri
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import android.util.Log
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Print
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.kidsgalaxy.connection.GalaxyTarget
import com.kidsgalaxy.manager.R
import com.kidsgalaxy.manager.data.PlanetDto
import com.kidsgalaxy.manager.data.PlanetExportClient
import com.kidsgalaxy.manager.data.PlanetExportHttpException
import com.kidsgalaxy.manager.data.PlanetExportPayloadException
import kotlinx.coroutines.launch
import java.io.FileOutputStream
import java.io.IOException

private const val EXPORT_LOG_TAG = "KidsGalaxyExport"
private const val ANDROID_PRINT_FEATURE = "android.software.print"

private enum class PrintFailureStage {
    UNAVAILABLE,
    LAUNCH,
}

private class PrintStageException(
    val stage: PrintFailureStage,
    message: String,
    cause: Throwable? = null,
) : IllegalStateException(message, cause)

private class ServerPdfPrintAdapter(
    private val jobName: String,
    private val pdfBytes: ByteArray,
) : PrintDocumentAdapter() {
    override fun onLayout(
        oldAttributes: PrintAttributes?,
        newAttributes: PrintAttributes?,
        cancellationSignal: CancellationSignal,
        callback: LayoutResultCallback,
        extras: android.os.Bundle?,
    ) {
        if (cancellationSignal.isCanceled) {
            callback.onLayoutCancelled()
            return
        }
        callback.onLayoutFinished(
            PrintDocumentInfo
                .Builder("$jobName.pdf")
                .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                .setPageCount(1)
                .build(),
            true,
        )
    }

    override fun onWrite(
        pages: Array<out PageRange>,
        destination: ParcelFileDescriptor,
        cancellationSignal: CancellationSignal,
        callback: WriteResultCallback,
    ) {
        if (cancellationSignal.isCanceled) {
            callback.onWriteCancelled()
            return
        }
        try {
            FileOutputStream(destination.fileDescriptor).use { output ->
                output.write(pdfBytes)
                output.flush()
            }
            callback.onWriteFinished(arrayOf(PageRange.ALL_PAGES))
        } catch (error: IOException) {
            Log.e(EXPORT_LOG_TAG, "Could not stream server PDF to Android printing", error)
            callback.onWriteFailed(error.message ?: "Could not write print PDF")
        }
    }
}

@Composable
fun PlanetExportActions(
    planet: PlanetDto,
    galaxy: GalaxyTarget,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val client = remember(galaxy.baseUrl) { PlanetExportClient(context, galaxy.baseUrl) }
    val stlPreparingDescription = stringResource(R.string.stl_preparing_accessibility)
    var pendingPrintPdf by remember { mutableStateOf<ByteArray?>(null) }
    var pendingPrintFailureDetail by remember { mutableStateOf<String?>(null) }
    var pendingStl by remember { mutableStateOf<ByteArray?>(null) }
    var isStlPreparing by remember { mutableStateOf(false) }

    val printFallbackLauncher =
        rememberLauncherForActivityResult(
            ActivityResultContracts.CreateDocument("application/pdf"),
        ) { uri ->
            val bytes = pendingPrintPdf
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
            pendingPrintPdf = null
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
                        val pdfBytes = client.printPdf(planet.id)
                        try {
                            startAndroidPrint(
                                context = context,
                                jobName = "${planet.name} - Kids Galaxy",
                                pdfBytes = pdfBytes,
                            )
                        } catch (error: PrintStageException) {
                            if (error.stage != PrintFailureStage.LAUNCH) {
                                throw error
                            }

                            val detail = error.diagnosticDetail()
                            Log.e(EXPORT_LOG_TAG, "Android print dialog failed", error)
                            pendingPrintPdf = pdfBytes
                            pendingPrintFailureDetail = detail
                            Toast
                                .makeText(
                                    context,
                                    context.getString(R.string.print_start_failed_saving, detail),
                                    Toast.LENGTH_LONG,
                                ).show()
                            try {
                                printFallbackLauncher.launch(printPdfFilename(planet))
                            } catch (fallbackError: RuntimeException) {
                                pendingPrintPdf = null
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
            enabled = !isStlPreparing,
            onClick = {
                if (!isStlPreparing) {
                    isStlPreparing = true
                    Toast
                        .makeText(
                            context,
                            context.getString(R.string.stl_preparing),
                            Toast.LENGTH_LONG,
                        ).show()
                    scope.launch {
                        try {
                            pendingStl = client.stl(planet.id)
                            stlLauncher.launch(stlFilename(planet))
                        } catch (error: Exception) {
                            pendingStl = null
                            showExportError(context, error)
                        } finally {
                            isStlPreparing = false
                        }
                    }
                }
            },
        ) {
            if (isStlPreparing) {
                CircularProgressIndicator(
                    modifier =
                        Modifier
                            .size(24.dp)
                            .semantics { contentDescription = stlPreparingDescription },
                    strokeWidth = 2.dp,
                )
            } else {
                Icon(
                    Icons.Default.Download,
                    contentDescription = stringResource(R.string.download_stl),
                )
            }
        }
    }
}

private fun startAndroidPrint(
    context: Context,
    jobName: String,
    pdfBytes: ByteArray,
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
    val printManager =
        activity.getSystemService(Context.PRINT_SERVICE) as? PrintManager
            ?: throw PrintStageException(
                PrintFailureStage.UNAVAILABLE,
                "Android print service is unavailable",
            )

    try {
        val attributes =
            PrintAttributes
                .Builder()
                .setMediaSize(PrintAttributes.MediaSize.NA_LETTER.asLandscape())
                .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                .build()
        printManager.print(
            jobName,
            ServerPdfPrintAdapter(jobName, pdfBytes),
            attributes,
        )
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

private fun printPdfFilename(planet: PlanetDto): String = "${safePlanetName(planet)}_${planet.id}_print.pdf"

private fun stlFilename(planet: PlanetDto): String = "${safePlanetName(planet)}_${planet.id}.stl"

private fun safePlanetName(planet: PlanetDto): String =
    planet.name
        .trim()
        .replace(Regex("[^A-Za-z0-9._-]+"), "_")
        .trim('_')
        .ifBlank { "planet" }
