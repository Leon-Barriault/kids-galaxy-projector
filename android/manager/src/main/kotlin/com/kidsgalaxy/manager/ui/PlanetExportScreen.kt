package com.kidsgalaxy.manager.ui

import android.content.Context
import android.graphics.BitmapFactory
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
import kotlinx.coroutines.launch
import java.io.IOException

@Composable
fun PlanetExportActions(
    planet: PlanetDto,
    galaxy: GalaxyTarget,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val client = remember(galaxy.baseUrl) { PlanetExportClient(context, galaxy.baseUrl) }
    var pendingStl by remember { mutableStateOf<ByteArray?>(null) }
    val stlLauncher =
        rememberLauncherForActivityResult(
            ActivityResultContracts.CreateDocument("model/stl"),
        ) { uri ->
            val bytes = pendingStl
            if (uri != null && bytes != null) {
                try {
                    val output = context.contentResolver.openOutputStream(uri)
                    if (output == null) {
                        error("Could not open export document")
                    }
                    output.use { stream -> stream.write(bytes) }
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
                        val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                        if (bitmap == null) {
                            showExportError(context, IllegalStateException("Invalid print image"))
                        } else {
                            PrintHelper(context).apply {
                                scaleMode = PrintHelper.SCALE_MODE_FIT
                                colorMode = PrintHelper.COLOR_MODE_COLOR
                                printBitmap("${planet.name} - Kids Galaxy", bitmap)
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

private fun showExportError(
    context: Context,
    error: Exception,
) {
    val message =
        when (error) {
            is PlanetExportHttpException ->
                context.getString(R.string.export_server_failed, error.statusCode)
            is IOException ->
                context.getString(R.string.export_network_failed)
            else ->
                context.getString(R.string.export_failed)
        }
    Toast.makeText(context, message, Toast.LENGTH_LONG).show()
}

private fun stlFilename(planet: PlanetDto): String {
    val safeName =
        planet.name
            .trim()
            .replace(Regex("[^A-Za-z0-9._-]+"), "_")
            .trim('_')
            .ifBlank { "planet" }
    return "${safeName}_${planet.id}.stl"
}
