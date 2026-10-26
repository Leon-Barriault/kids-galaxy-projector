package com.kidsgalaxy.connection

import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Locale

class UiLanguageTest {
    @Test
    fun `language toggle switches both directions`() {
        assertEquals(UiLanguage.FRENCH, UiLanguage.ENGLISH.toggled())
        assertEquals(UiLanguage.ENGLISH, UiLanguage.FRENCH.toggled())
    }

    @Test
    fun `stored language tag restores known language`() {
        assertEquals(UiLanguage.ENGLISH, UiLanguage.fromTag("en"))
        assertEquals(UiLanguage.FRENCH, UiLanguage.fromTag("fr"))
        assertEquals(UiLanguage.FRENCH, UiLanguage.fromTag("fr-CA"))
    }

    @Test
    fun `unknown language tag safely defaults to English`() {
        assertEquals(UiLanguage.ENGLISH, UiLanguage.fromTag(null))
        assertEquals(UiLanguage.ENGLISH, UiLanguage.fromTag("es"))
    }

    @Test
    fun `device locale defaults to French only for French devices`() {
        assertEquals(UiLanguage.FRENCH, UiLanguage.fromLocale(Locale.CANADA_FRENCH))
        assertEquals(UiLanguage.FRENCH, UiLanguage.fromLocale(Locale.FRANCE))
        assertEquals(UiLanguage.ENGLISH, UiLanguage.fromLocale(Locale.CANADA))
        assertEquals(UiLanguage.ENGLISH, UiLanguage.fromLocale(Locale.US))
    }

    @Test
    fun `french requests Canadian French resources and accept language`() {
        assertEquals("fr-CA", UiLanguage.FRENCH.localeTag)
        assertEquals("fr-CA,fr;q=0.9", UiLanguage.FRENCH.acceptLanguage)
        assertEquals("en", UiLanguage.ENGLISH.acceptLanguage)
    }
}
