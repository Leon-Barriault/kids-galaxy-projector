package com.kidsgalaxy.data.repository

import android.util.Log
import com.kidsgalaxy.data.remote.DrawingManifestSerializer
import com.kidsgalaxy.data.remote.PlanetApi
import com.kidsgalaxy.domain.model.Drawing
import com.kidsgalaxy.domain.model.PlanetDesign
import com.kidsgalaxy.domain.render.PlanetTextureRenderer
import com.kidsgalaxy.domain.repository.PlanetRepository
import com.kidsgalaxy.domain.repository.UploadRejectedException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody

/** Implements the domain's [PlanetRepository] port over Retrofit. */
class RetrofitPlanetRepository(
    private val api: PlanetApi,
    private val renderer: PlanetTextureRenderer,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : PlanetRepository {
    override suspend fun sendPlanet(
        drawing: Drawing,
        name: String,
    ): Result<Unit> = sendPlanet(drawing, name, PlanetDesign())

    override suspend fun sendPlanet(
        drawing: Drawing,
        name: String,
        design: PlanetDesign,
    ): Result<Unit> =
        withContext(ioDispatcher) {
            runCatching {
                val png = renderer.renderPng(drawing)
                val filePart =
                    MultipartBody.Part.createFormData(
                        "file",
                        "planet.png",
                        png.toRequestBody(PNG_MEDIA_TYPE.toMediaType()),
                    )
                val manifestPart =
                    MultipartBody.Part.createFormData(
                        "manifest",
                        "drawing-manifest.json",
                        DrawingManifestSerializer
                            .toJson(drawing)
                            .toRequestBody(JSON_MEDIA_TYPE.toMediaType()),
                    )
                val namePart = name.toTextPart()
                val stylePart = design.style.wireValue.toTextPart()
                val companionPart =
                    design.companions
                        .sortedBy { it.ordinal }
                        .joinToString(",") { it.wireValue }
                        .toTextPart()
                val bodyColorPart = drawing.backgroundColorArgb.toRgbHex().toTextPart()
                val ringColorPart = design.ringColorArgb.toRgbHex().toTextPart()
                val craterColorPart = design.craterColorArgb.toRgbHex().toTextPart()
                val mountainColorPart = design.mountainColorArgb.toRgbHex().toTextPart()

                val response =
                    api.uploadPlanet(
                        filePart,
                        manifestPart,
                        namePart,
                        stylePart,
                        companionPart,
                        bodyColorPart,
                        ringColorPart,
                        craterColorPart,
                        mountainColorPart,
                    )
                if (!response.isSuccessful) {
                    throw UploadRejectedException(response.code())
                }
            }.onFailure { Log.w(TAG, "Upload failed", it) }
        }

    private fun String.toTextPart() = toRequestBody(TEXT_MEDIA_TYPE.toMediaType())

    private fun Int.toRgbHex(): String = "#%06x".format(this and 0x00FFFFFF)

    private companion object {
        const val TAG = "KidsGalaxyRepo"
        const val PNG_MEDIA_TYPE = "image/png"
        const val JSON_MEDIA_TYPE = "application/json"
        const val TEXT_MEDIA_TYPE = "text/plain"
    }
}
