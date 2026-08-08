package com.kidsgalaxy.connection

import android.content.Context
import okhttp3.OkHttpClient
import java.io.IOException
import java.security.KeyStore
import java.security.cert.CertificateFactory
import javax.net.ssl.KeyManagerFactory
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

/** Shared CA pinning and client-certificate setup for both tablet apps. */
object MutualTls {
    class CertificateSetupException(
        message: String,
        cause: Throwable? = null,
    ) : IOException(message, cause)

    fun apply(
        context: Context,
        builder: OkHttpClient.Builder,
        clientCertificateAsset: String,
        password: CharArray,
        caCertificateAsset: String = "ca.crt",
    ) {
        try {
            val keyManagers =
                loadClientIdentity(
                    context = context,
                    assetName = clientCertificateAsset,
                    password = password,
                )
            val trustManager = loadCaTrustManager(context, caCertificateAsset)
            val sslContext =
                SSLContext.getInstance("TLS").apply {
                    init(keyManagers, arrayOf(trustManager), null)
                }
            builder.sslSocketFactory(sslContext.socketFactory, trustManager)
        } catch (error: CertificateSetupException) {
            throw error
        } catch (error: Exception) {
            throw CertificateSetupException(
                "Could not initialise mTLS with '$clientCertificateAsset' and '$caCertificateAsset'.",
                error,
            )
        }
    }

    private fun loadClientIdentity(
        context: Context,
        assetName: String,
        password: CharArray,
    ): Array<javax.net.ssl.KeyManager> {
        val keyStore =
            KeyStore.getInstance("PKCS12").apply {
                try {
                    context.assets.open(assetName).use { load(it, password) }
                } catch (error: IOException) {
                    throw CertificateSetupException(
                        "Missing client certificate asset '$assetName'.",
                        error,
                    )
                }
            }

        return KeyManagerFactory
            .getInstance(KeyManagerFactory.getDefaultAlgorithm())
            .apply { init(keyStore, password) }
            .keyManagers
    }

    private fun loadCaTrustManager(
        context: Context,
        assetName: String,
    ): X509TrustManager {
        val caCertificate =
            try {
                context.assets.open(assetName).use { input ->
                    CertificateFactory.getInstance("X.509").generateCertificate(input)
                }
            } catch (error: IOException) {
                throw CertificateSetupException(
                    "Missing CA certificate asset '$assetName'.",
                    error,
                )
            }

        val trustStore =
            KeyStore.getInstance(KeyStore.getDefaultType()).apply {
                load(null, null)
                setCertificateEntry("kids-galaxy-ca", caCertificate)
            }
        val factory =
            TrustManagerFactory
                .getInstance(TrustManagerFactory.getDefaultAlgorithm())
                .apply { init(trustStore) }

        return factory.trustManagers.filterIsInstance<X509TrustManager>().firstOrNull()
            ?: throw CertificateSetupException("No X509TrustManager available for the Kids Galaxy CA.")
    }
}
