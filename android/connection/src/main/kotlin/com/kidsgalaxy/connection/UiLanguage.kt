package com.kidsgalaxy.connection

import android.content.Context
import android.content.res.Configuration
import java.util.Locale

enum class UiLanguage(
    val tag: String,
    val localeTag: String,
    val acceptLanguage: String,
) {
    ENGLISH("en", "en", "en"),
    FRENCH("fr", "fr-CA", "fr-CA,fr;q=0.9"),
    ;

    fun toggled(): UiLanguage = if (this == ENGLISH) FRENCH else ENGLISH

    companion object {
        fun fromTag(tag: String?): UiLanguage {
            val primary =
                tag
                    ?.lowercase(Locale.ROOT)
                    ?.substringBefore('-')
                    ?.substringBefore('_')
            return when (primary) {
                "fr" -> FRENCH
                "en" -> ENGLISH
                else -> ENGLISH
            }
        }

        /** First-launch choice: Canadian French devices open in French. */
        fun fromLocale(locale: Locale): UiLanguage = fromTag(locale.language)
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

    fun load(): UiLanguage {
        if (!preferences.contains(KEY_LANGUAGE)) {
            return UiLanguage.fromLocale(Locale.getDefault())
        }
        return UiLanguage.fromTag(preferences.getString(KEY_LANGUAGE, null))
    }

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
    val locale = Locale.forLanguageTag(language.localeTag)
    val configuration = Configuration(resources.configuration)
    configuration.setLocale(locale)
    configuration.setLayoutDirection(locale)
    return createConfigurationContext(configuration)
}
