package com.kidsgalaxy.connection

import java.net.URI

/**
 * A galaxy endpoint selected by a tablet.
 *
 * The target is intentionally transport-level configuration rather than a
 * drawing or manager domain object: both tablet apps need it, while neither
 * business domain should know about URLs.
 */
data class GalaxyTarget(
    val name: String,
    val baseUrl: String,
) {
    companion object {
        fun create(
            name: String,
            baseUrl: String,
        ): GalaxyTarget =
            GalaxyTarget(
                name = name.trim().ifBlank { "Kids Galaxy" },
                baseUrl = normalizeBaseUrl(baseUrl),
            )

        fun fromEndpoint(
            name: String,
            scheme: String,
            host: String,
            port: Int,
        ): GalaxyTarget {
            require(port in 1..65535) { "Galaxy port must be between 1 and 65535" }
            val safeScheme = normalizeScheme(scheme)
            val safeHost = host.trim().removePrefix("[").removeSuffix("]")
            require(safeHost.isNotBlank()) { "Galaxy host is required" }
            val urlHost = if (':' in safeHost) "[$safeHost]" else safeHost
            return create(name, "$safeScheme://$urlHost:$port/")
        }

        /** Accepts either a full URL or a host[:port] entered by a volunteer. */
        fun fromManual(
            rawAddress: String,
            defaultScheme: String = "http",
            name: String = "Manual Galaxy",
        ): GalaxyTarget {
            val trimmed = rawAddress.trim()
            require(trimmed.isNotBlank()) { "Galaxy address is required" }
            val withScheme =
                if (trimmed.contains("://")) {
                    trimmed
                } else {
                    "${normalizeScheme(defaultScheme)}://$trimmed"
                }
            return create(name, withScheme)
        }

        private fun normalizeBaseUrl(raw: String): String {
            val uri = URI(raw.trim())
            val scheme = normalizeScheme(uri.scheme ?: "")
            require(uri.host != null) { "Galaxy URL must include a host" }
            require(uri.userInfo == null) { "Galaxy URL must not contain credentials" }
            require(uri.query == null && uri.fragment == null) {
                "Galaxy URL must not contain a query or fragment"
            }
            require(uri.path.isNullOrEmpty() || uri.path == "/") {
                "Galaxy URL must point to the server root"
            }

            // URI implementations are inconsistent about whether host keeps
            // IPv6 brackets. Strip them once here and add exactly one pair in
            // the serialized URL.
            val host = uri.host.removePrefix("[").removeSuffix("]")
            val urlHost = if (':' in host) "[$host]" else host
            val port = if (uri.port == -1) "" else ":${uri.port}"
            return "$scheme://$urlHost$port/"
        }

        private fun normalizeScheme(raw: String): String {
            val scheme = raw.trim().lowercase()
            require(scheme == "http" || scheme == "https") {
                "Galaxy URL must use http or https"
            }
            return scheme
        }
    }
}
