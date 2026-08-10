package com.kidsgalaxy.manager.data

import com.google.gson.annotations.SerializedName
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

data class PlanetDto(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String,
    @SerializedName("url") val url: String,
    @SerializedName("timestamp") val timestamp: Double? = null,
    @SerializedName("has_planet") val hasPlanet: Boolean? = null,
    @SerializedName("style") val style: String = "classic",
)

data class PlanetListResponse(
    @SerializedName("planets") val planets: List<PlanetDto>,
)

data class DeleteResponse(
    @SerializedName("status") val status: String,
    @SerializedName("planet_id") val planetId: String? = null,
    @SerializedName("name") val name: String? = null,
)

data class ClearResponse(
    @SerializedName("status") val status: String,
    @SerializedName("removed") val removed: Int = 0,
)

data class BehaviorSettingsDto(
    @SerializedName("mode") val mode: String = "auto",
    @SerializedName("manual_theme") val manualTheme: String = "default",
    @SerializedName("planet_speed") val planetSpeed: Double = 1.0,
    @SerializedName("ambient_effects") val ambientEffects: Boolean = true,
    @SerializedName("projector_language") val projectorLanguage: String = "en",
    @SerializedName("asteroid_belt_enabled") val asteroidBeltEnabled: Boolean = false,
    @SerializedName("comets_enabled") val cometsEnabled: Boolean = false,
    @SerializedName("comet_frequency") val cometFrequency: String = "normal",
    @SerializedName("flyby_asteroids_enabled") val flybyAsteroidsEnabled: Boolean = false,
    @SerializedName("flyby_frequency") val flybyFrequency: String = "normal",
    @SerializedName("enabled_themes")
    val enabledThemes: List<String> = listOf("default", "halloween", "easter", "christmas"),
)

data class BehaviorStateDto(
    @SerializedName("settings") val settings: BehaviorSettingsDto,
)

interface ManagerApi {
    @GET("api/planets")
    suspend fun listPlanets(
        @Query("limit") limit: Int = 30,
    ): Response<PlanetListResponse>

    @GET("api/admin/planets/{id}/print.png")
    suspend fun printSheet(
        @Path("id") id: String,
    ): Response<ResponseBody>

    @GET("api/admin/planets/{id}/model.stl")
    suspend fun exportStl(
        @Path("id") id: String,
        @Query("diameter_mm") diameterMm: Double = 80.0,
    ): Response<ResponseBody>

    @DELETE("api/planets/{id}")
    suspend fun deletePlanet(
        @Path("id") id: String,
    ): Response<DeleteResponse>

    /** Empties the whole gallery. The server publishes one clear event. */
    @DELETE("api/planets")
    suspend fun clearPlanets(): Response<ClearResponse>

    @GET("api/behavior")
    suspend fun getBehavior(): Response<BehaviorStateDto>

    @PUT("api/behavior")
    suspend fun updateBehavior(
        @Body settings: BehaviorSettingsDto,
    ): Response<BehaviorStateDto>
}
