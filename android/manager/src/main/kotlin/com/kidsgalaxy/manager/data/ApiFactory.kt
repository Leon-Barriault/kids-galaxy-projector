package com.kidsgalaxy.manager.data

import com.kidsgalaxy.manager.BuildConfig
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/** HTTP client for whichever galaxy the volunteer selected. */
object ApiFactory {
    fun create(baseUrl: String = BuildConfig.SERVER_BASE_URL): ManagerApi {
        val builder =
            OkHttpClient
                .Builder()
                .connectTimeout(8, TimeUnit.SECONDS)
                .readTimeout(15, TimeUnit.SECONDS)

        // Debug only, matching the drawing app. Request logging must never ship
        // enabled: this app deletes things, and its traffic names the
        // children's planets.
        if (BuildConfig.DEBUG) {
            builder.addInterceptor(
                HttpLoggingInterceptor().apply {
                    level = HttpLoggingInterceptor.Level.BASIC
                },
            )
        }

        val client = builder.build()

        return Retrofit
            .Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ManagerApi::class.java)
    }
}
