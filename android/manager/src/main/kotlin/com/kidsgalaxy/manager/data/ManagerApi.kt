package com.kidsgalaxy.manager.data

import com.google.gson.annotations.SerializedName
import retrofit2.Response
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

data class PlanetDto(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String,
    @SerializedName("url") val url: String,
    @SerializedName("timestamp") val timestamp: Double? = null,
    @SerializedName("has_planet") val hasPlanet: Boolean? = null,
)

data class PlanetListResponse(
    @SerializedName("planets") val planets: List<PlanetDto>,
)

data class DeleteResponse(
    @SerializedName("status") val status: String,
    @SerializedName("planet_id") val planetId: String? = null,
    @SerializedName("name") val name: String? = null,
)

interface ManagerApi {
    @GET("api/planets")
    suspend fun listPlanets(
        @Query("limit") limit: Int = 30,
    ): Response<PlanetListResponse>

    @DELETE("api/planets/{id}")
    suspend fun deletePlanet(
        @Path("id") id: String,
    ): Response<DeleteResponse>
}
