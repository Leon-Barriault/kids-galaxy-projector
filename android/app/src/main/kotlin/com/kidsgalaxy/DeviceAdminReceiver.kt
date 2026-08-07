package com.kidsgalaxy

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Device Admin receiver required for Lock Task Mode / kiosk (Device Owner).
 * Set as device owner with:
 *   adb shell dpm set-device-owner com.kidsgalaxy/.DeviceAdminReceiver
 */
class DeviceAdminReceiver : DeviceAdminReceiver() {
    override fun onEnabled(context: Context, intent: Intent) {
        Log.i(TAG, "Device admin enabled – kiosk mode available")
    }

    override fun onDisabled(context: Context, intent: Intent) {
        Log.i(TAG, "Device admin disabled")
    }

    companion object {
        private const val TAG = "KidsGalaxyAdmin"
    }
}
