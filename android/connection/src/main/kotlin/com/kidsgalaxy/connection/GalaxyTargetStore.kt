package com.kidsgalaxy.connection

import android.content.Context

/** Persistent tablet preference for which galaxy receives its requests. */
interface GalaxyTargetStore {
    fun load(defaultTarget: GalaxyTarget): GalaxyTarget

    fun save(target: GalaxyTarget)

    fun clear()
}

class SharedPreferencesGalaxyTargetStore(
    context: Context,
) : GalaxyTargetStore {
    private val preferences =
        context.applicationContext.getSharedPreferences(
            PREFERENCE_FILE,
            Context.MODE_PRIVATE,
        )

    override fun load(defaultTarget: GalaxyTarget): GalaxyTarget {
        val name = preferences.getString(KEY_NAME, null) ?: return defaultTarget
        val baseUrl = preferences.getString(KEY_BASE_URL, null) ?: return defaultTarget
        return try {
            GalaxyTarget.create(name, baseUrl)
        } catch (_error: IllegalArgumentException) {
            defaultTarget
        }
    }

    override fun save(target: GalaxyTarget) {
        val normalized = GalaxyTarget.create(target.name, target.baseUrl)
        preferences
            .edit()
            .putString(KEY_NAME, normalized.name)
            .putString(KEY_BASE_URL, normalized.baseUrl)
            .apply()
    }

    override fun clear() {
        preferences.edit().clear().apply()
    }

    private companion object {
        const val PREFERENCE_FILE = "kids_galaxy_connection"
        const val KEY_NAME = "galaxy_name"
        const val KEY_BASE_URL = "galaxy_base_url"
    }
}
