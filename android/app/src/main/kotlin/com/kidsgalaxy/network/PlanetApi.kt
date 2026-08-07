package com.kidsgalaxy.network

import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part

data class UploadResponse(
    val status: String,
    val message: String,
    val planet_id: String? = null,
    val name: String? = null
)

interface PlanetApi {
    @Multipart
    @POST("api/upload")
    suspend fun uploadPlanet(
        @Part file: MultipartBody.Part,
        @Part("name") name: RequestBody
    ): Response<UploadResponse>
}
