package com.kidsgalaxy.manager.data

import android.content.Context

class PlanetExportClient(
    context: Context,
    baseUrl: String,
) {
    private val api = ApiFactory.create(context.applicationContext, baseUrl)

    suspend fun printSheet(planetId: String): ByteArray {
        val response = api.printSheet(planetId)
        check(response.isSuccessful) { "Print export failed (${response.code()})" }
        return requireNotNull(response.body()).bytes()
    }

    suspend fun stl(
        planetId: String,
        diameterMm: Double = 80.0,
    ): ByteArray {
        val response = api.exportStl(planetId, diameterMm)
        check(response.isSuccessful) { "STL export failed (${response.code()})" }
        return requireNotNull(response.body()).bytes()
    }
}
