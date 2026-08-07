package com.kidsgalaxy.data.repository

import android.util.Log
import com.kidsgalaxy.data.remote.PlanetApi
import com.kidsgalaxy.domain.model.Drawing
import com.kidsgalaxy.domain.render.PlanetTextureRenderer
import com.kidsgalaxy.domain.repository.PlanetRepository
import com.kidsgalaxy.domain.repository.UploadRejectedException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody

/**
 * Implements the domain's [PlanetRepository] port over Retrofit.
 *
 * Rendering and network I/O are moved off the main thread here, so neither the
 * ViewModel nor the use case has to know about dispatchers.
 */
class RetrofitPlanetRepository(
    private val api: PlanetApi,
    private val renderer: PlanetTextureRenderer,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : PlanetRepository {
    override suspend fun sendPlanet(
        drawing: Drawing,
        name: String,
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
                val namePart = name.toRequestBody(TEXT_MEDIA_TYPE.toMediaType())

                val response = api.uploadPlanet(filePart, namePart)
                if (!response.isSuccessful) {
                    // Domain-level failure type, so the UI can explain *why*
                    // without depending on this adapter.
                    throw UploadRejectedException(response.code())
                }
            }.onFailure { Log.w(TAG, "Upload failed", it) }
        }

    private companion object {
        const val TAG = "KidsGalaxyRepo"
        const val PNG_MEDIA_TYPE = "image/png"
        const val TEXT_MEDIA_TYPE = "text/plain"
    }
}
