package com.kidsgalaxy.connection

import android.content.Context
import android.content.res.Configuration
import java.util.Locale

enum class UiLanguage(
    val tag: String,
) {
    ENGLISH("en"),
    FRENCH("fr"),
    ;

    fun toggled(): UiLanguage = if (this == ENGLISH) FRENCH else ENGLISH

    companion object {
        fun fromTag(tag: String?): UiLanguage = entries.firstOrNull { it.tag == tag } ?: ENGLISH
    }
}

/** Shared preference used by both kid and manager tablets. */
class SharedPreferencesUiLanguageStore(
    context: Context,
) {
    private val preferences =
        context.applicationContext.getSharedPreferences(
            PREFERENCE_FILE,
            Context.MODE_PRIVATE,
        )

    fun load(): UiLanguage = UiLanguage.fromTag(preferences.getString(KEY_LANGUAGE, null))

    fun save(language: UiLanguage) {
        preferences.edit().putString(KEY_LANGUAGE, language.tag).apply()
    }

    private companion object {
        const val PREFERENCE_FILE = "kids_galaxy_ui"
        const val KEY_LANGUAGE = "language"
    }
}

/** Apply the persisted app language without changing the tablet's system language. */
fun Context.withUiLanguage(language: UiLanguage): Context {
    val locale = Locale.forLanguageTag(language.tag)
    val configuration = Configuration(resources.configuration)
    configuration.setLocale(locale)
    configuration.setLayoutDirection(locale)
    return createConfigurationContext(configuration)
}
