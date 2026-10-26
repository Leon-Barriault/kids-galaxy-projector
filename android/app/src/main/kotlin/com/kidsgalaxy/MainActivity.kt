package com.kidsgalaxy

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.kidsgalaxy.connection.GalaxyTarget
import com.kidsgalaxy.connection.SharedPreferencesGalaxyTargetStore
import com.kidsgalaxy.connection.SharedPreferencesUiLanguageStore
import com.kidsgalaxy.connection.withUiLanguage
import com.kidsgalaxy.ui.GalaxyPickerDialog
import com.kidsgalaxy.ui.PlanetDrawerScreen
import com.kidsgalaxy.ui.theme.KidsGalaxyTheme
import java.net.URI

/** Single-screen kiosk activity with persistent galaxy and language targets. */
class MainActivity : ComponentActivity() {
    override fun attachBaseContext(newBase: Context) {
        val language = SharedPreferencesUiLanguageStore(newBase).load()
        super.attachBaseContext(newBase.withUiLanguage(language))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        enterKioskIfDeviceOwner()

        setContent {
            KidsGalaxyTheme {
                val store = remember { SharedPreferencesGalaxyTargetStore(this) }
                val languageStore = remember { SharedPreferencesUiLanguageStore(this) }
                val language = remember { languageStore.load() }
                val defaultGalaxyName = stringResource(R.string.default_galaxy_name)
                val defaultTarget =
                    remember(defaultGalaxyName) {
                        GalaxyTarget.create(defaultGalaxyName, BuildConfig.SERVER_BASE_URL)
                    }
                var selectedGalaxy by remember { mutableStateOf(store.load(defaultTarget)) }
                var showGalaxyPicker by remember { mutableStateOf(false) }
                val fallbackScheme =
                    remember { URI(BuildConfig.SERVER_BASE_URL).scheme ?: "http" }

                PlanetDrawerScreen(
                    galaxy = selectedGalaxy,
                    language = language,
                    onConfigureGalaxy = { showGalaxyPicker = true },
                    onToggleLanguage = {
                        languageStore.save(language.toggled())
                        recreate()
                    },
                )

                if (showGalaxyPicker) {
                    GalaxyPickerDialog(
                        current = selectedGalaxy,
                        fallbackScheme = fallbackScheme,
                        onSelect = { target ->
                            store.save(target)
                            selectedGalaxy = target
                            showGalaxyPicker = false
                        },
                        onDismiss = { showGalaxyPicker = false },
                    )
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        enterKioskIfDeviceOwner()
    }

    /**
     * Lock Task is only entered when this package is the device owner.
     * A normal debug install is left alone so development is not pinned.
     */
    private fun enterKioskIfDeviceOwner() {
        val policy = getSystemService(DevicePolicyManager::class.java) ?: return
        if (!policy.isDeviceOwnerApp(packageName)) return
        val admin = ComponentName(this, DeviceAdminReceiver::class.java)
        try {
            policy.setLockTaskPackages(admin, arrayOf(packageName))
            policy.setKeyguardDisabled(admin, true)
            if (policy.isLockTaskPermitted(packageName)) {
                startLockTask()
                hideSystemBars()
            }
        } catch (error: SecurityException) {
            Log.w(TAG, "Device-owner kiosk setup was rejected", error)
        }
    }

    private fun hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

    private companion object {
        const val TAG = "KidsGalaxyKiosk"
    }
}
