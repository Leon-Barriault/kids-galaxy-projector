package com.kidsgalaxy.connection

import android.content.Context
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response

/** Send the tablet's persisted language so server messages match the UI. */
fun OkHttpClient.Builder.acceptUiLanguage(context: Context): OkHttpClient.Builder =
    addInterceptor(
        AcceptLanguageInterceptor {
            SharedPreferencesUiLanguageStore(context).load()
        },
    )

class AcceptLanguageInterceptor(
    private val language: () -> UiLanguage,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request =
            chain
                .request()
                .newBuilder()
                .header("Accept-Language", language().acceptLanguage)
                .build()
        return chain.proceed(request)
    }
}
