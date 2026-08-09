package com.kidsgalaxy.data.remote

import com.google.gson.annotations.SerializedName
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part

data class UploadResponse(
    @SerializedName("status") val status: String,
    @SerializedName("message") val message: String,
    @SerializedName("planet_id") val planetId: String? = null,
    @SerializedName("name") val name: String? = null,
    @SerializedName("url") val url: String? = null,
    @SerializedName("style") val style: String? = null,
    @SerializedName("companions") val companions: List<String> = emptyList(),
    @SerializedName("ring_color") val ringColor: String? = null,
    @SerializedName("crater_color") val craterColor: String? = null,
    @SerializedName("mountain_color") val mountainColor: String? = null,
)

interface PlanetApi {
    @Multipart
    @POST("api/upload")
    suspend fun uploadPlanet(
        @Part file: MultipartBody.Part,
        @Part("name") name: RequestBody,
        @Part("style") style: RequestBody,
        @Part("companions") companions: RequestBody,
        @Part("ring_color") ringColor: RequestBody,
        @Part("crater_color") craterColor: RequestBody,
        @Part("mountain_color") mountainColor: RequestBody,
    ): Response<UploadResponse>
}
