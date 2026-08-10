package com.kidsgalaxy.manager.ui

import android.graphics.BitmapFactory
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Print
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.print.PrintHelper
import com.kidsgalaxy.connection.GalaxyTarget
import com.kidsgalaxy.manager.ManagerUiState
import com.kidsgalaxy.manager.R
import com.kidsgalaxy.manager.data.PlanetDto
import com.kidsgalaxy.manager.data.PlanetExportClient
import kotlinx.coroutines.launch

private val ExportBackground = Color(0xFF0A0E2A)
private val ExportCard = Color(0xFF141A3A)

@Composable
fun PlanetExportScreen(
    state: ManagerUiState,
    galaxy: GalaxyTarget,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val client = remember(galaxy.baseUrl) { PlanetExportClient(context, galaxy.baseUrl) }
    var pendingStl by remember { mutableStateOf<Pair<PlanetDto, ByteArray>?>(null) }
    val stlLauncher =
        rememberLauncherForActivityResult(
            ActivityResultContracts.CreateDocument("model/stl"),
        ) { uri ->
            val pending = pendingStl
            if (uri != null && pending != null) {
                runCatching {
                    context.contentResolver.openOutputStream(uri)?.use { output ->
                        output.write(pending.second)
                    } ?: error("Could not open export document")
                }.onFailure {
                    Toast.makeText(context, R.string.export_failed, Toast.LENGTH_LONG).show()
                }
            }
            pendingStl = null
        }

    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .background(ExportBackground)
                .padding(16.dp),
    ) {
        Text(
            text = stringResource(R.string.export_title),
            fontWeight = FontWeight.Bold,
        )
        Text(text = stringResource(R.string.export_hint))

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(state.planets, key = { it.id }) { planet ->
                ExportPlanetRow(
                    planet = planet,
                    onPrint = {
                        scope.launch {
                            runCatching { client.printSheet(planet.id) }
                                .onSuccess { bytes ->
                                    val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                                    if (bitmap == null) {
                                        Toast.makeText(
                                            context,
                                            R.string.export_failed,
                                            Toast.LENGTH_LONG,
                                        ).show()
                                    } else {
                                        PrintHelper(context)
                                            .apply {
                                                scaleMode = PrintHelper.SCALE_MODE_FIT
                                                colorMode = PrintHelper.COLOR_MODE_COLOR
                                            }.printBitmap("${planet.name} - Kids Galaxy", bitmap)
                                    }
                                }
                                .onFailure {
                                    Toast.makeText(
                                        context,
                                        R.string.export_failed,
                                        Toast.LENGTH_LONG,
                                    ).show()
                                }
                        }
                    },
                    onExportStl = {
                        scope.launch {
                            runCatching { client.stl(planet.id) }
                                .onSuccess { bytes ->
                                    pendingStl = planet to bytes
                                    stlLauncher.launch(stlFilename(planet))
                                }
                                .onFailure {
                                    Toast.makeText(
                                        context,
                                        R.string.export_failed,
                                        Toast.LENGTH_LONG,
                                    ).show()
                                }
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun ExportPlanetRow(
    planet: PlanetDto,
    onPrint: () -> Unit,
    onExportStl: () -> Unit,
) {
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(ExportCard)
                .padding(12.dp),
    ) {
        Text(
            text = planet.name,
            fontWeight = FontWeight.SemiBold,
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Button(onClick = onPrint) {
                Icon(Icons.Default.Print, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text(stringResource(R.string.print_planet))
            }
            Spacer(modifier = Modifier.width(10.dp))
            Button(onClick = onExportStl) {
                Icon(Icons.Default.Download, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text(stringResource(R.string.download_stl))
            }
        }
    }
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
