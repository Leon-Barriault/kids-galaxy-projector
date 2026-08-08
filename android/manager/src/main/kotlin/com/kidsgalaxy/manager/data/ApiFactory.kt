package com.kidsgalaxy.manager.data

import com.kidsgalaxy.manager.BuildConfig
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * HTTP client for the manager app.
 *
 * Debug builds talk cleartext HTTP to the same host as the drawing app.
 * This app is for volunteers on the closed event network.
 */
object ApiFactory {
    fun create(): ManagerApi {
        val logging =
            HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BASIC
            }
        val client =
            OkHttpClient
                .Builder()
                .connectTimeout(8, TimeUnit.SECONDS)
                .readTimeout(15, TimeUnit.SECONDS)
                .addInterceptor(logging)
                .build()

        return Retrofit
            .Builder()
            .baseUrl(BuildConfig.SERVER_BASE_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ManagerApi::class.java)
    }
}
