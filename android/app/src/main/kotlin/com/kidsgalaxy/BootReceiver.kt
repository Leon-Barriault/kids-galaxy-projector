package com.kidsgalaxy

import android.app.admin.DevicePolicyManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.kidsgalaxy.kiosk.KidTabletPolicy

/**
 * Opens the drawing app after a reboot or an update when this app is the
 * device owner. The saved galaxy address is already on the tablet, so the
 * child does not pick a room again. Wi-Fi may still be waking up, so the
 * start waits a few seconds.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(
        context: Context,
        intent: Intent?,
    ) {
        if (!KidTabletPolicy.launchesOnBoot(intent?.action)) return
        val pending = goAsync()
        Thread {
            try {
                Thread.sleep(KidTabletPolicy.BOOT_DELAY_MS)
                if (!isDeviceOwner(context)) return@Thread
                val launch =
                    Intent(context, MainActivity::class.java).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    }
                context.startActivity(launch)
            } catch (error: InterruptedException) {
                Thread.currentThread().interrupt()
                Log.w(TAG, "Boot launch was interrupted", error)
            } catch (error: RuntimeException) {
                Log.w(TAG, "Boot launch was rejected", error)
            } finally {
                pending.finish()
            }
        }.start()
    }

    private fun isDeviceOwner(context: Context): Boolean {
        val policy = context.getSystemService(DevicePolicyManager::class.java) ?: return false
        return policy.isDeviceOwnerApp(context.packageName)
    }

    private companion object {
        const val TAG = "KidsGalaxyBoot"
    }
}
