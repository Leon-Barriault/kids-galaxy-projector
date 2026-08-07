package com.kidsgalaxy.data.remote

import com.google.gson.annotations.SerializedName
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part

/**
 * Response returned by POST /api/upload.
 *
 * Field names are mapped explicitly so the Kotlin properties stay idiomatic
 * camelCase even though the server speaks snake_case, and so ProGuard's
 * renaming cannot break deserialization in release builds.
 */
data class UploadResponse(
    @SerializedName("status") val status: String,
    @SerializedName("message") val message: String,
    @SerializedName("planet_id") val planetId: String? = null,
    @SerializedName("name") val name: String? = null,
    @SerializedName("url") val url: String? = null,
)

interface PlanetApi {
    @Multipart
    @POST("api/upload")
    suspend fun uploadPlanet(
        @Part file: MultipartBody.Part,
        @Part("name") name: RequestBody,
    ): Response<UploadResponse>
}
