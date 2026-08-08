package com.kidsgalaxy.connection

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class GalaxyTargetTest {
    @Test
    fun `normalizes a configured base url`() {
        assertEquals(
            GalaxyTarget("Room 3", "http://10.42.0.3:8000/"),
            GalaxyTarget.create(" Room 3 ", "http://10.42.0.3:8000"),
        )
    }

    @Test
    fun `manual address inherits the selected transport`() {
        assertEquals(
            "https://10.42.0.7:8443/",
            GalaxyTarget.fromManual("10.42.0.7:8443", defaultScheme = "https").baseUrl,
        )
    }

    @Test
    fun `discovered endpoint includes the advertised port`() {
        assertEquals(
            GalaxyTarget("Library", "https://192.168.4.9:8443/"),
            GalaxyTarget.fromEndpoint("Library", "https", "192.168.4.9", 8443),
        )
    }

    @Test
    fun `ipv6 endpoint is bracketed in the url`() {
        assertEquals(
            "http://[fe80::1234]:8000/",
            GalaxyTarget.fromEndpoint("IPv6", "http", "fe80::1234", 8000).baseUrl,
        )
    }

    @Test
    fun `rejects unsupported schemes`() {
        assertThrows(IllegalArgumentException::class.java) {
            GalaxyTarget.create("Bad", "ftp://10.42.0.1/")
        }
    }

    @Test
    fun `rejects api paths because retrofit expects a server root`() {
        assertThrows(IllegalArgumentException::class.java) {
            GalaxyTarget.create("Bad", "http://10.42.0.1:8000/api/galaxy")
        }
    }
}
