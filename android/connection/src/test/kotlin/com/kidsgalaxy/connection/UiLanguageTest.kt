package com.kidsgalaxy.connection

import org.junit.Assert.assertEquals
import org.junit.Test

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
    }

    @Test
    fun `unknown language tag safely defaults to English`() {
        assertEquals(UiLanguage.ENGLISH, UiLanguage.fromTag(null))
        assertEquals(UiLanguage.ENGLISH, UiLanguage.fromTag("es"))
    }
}
