package com.kidsgalaxy.kiosk

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.Log
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.kidsgalaxy.DeviceAdminReceiver

/**
 * Applies [KidTabletPolicy] when this app is the device owner.
 * A normal install returns immediately so a debug tablet is not pinned.
 */
internal object KioskEnforcer {
    private const val TAG = "KidsGalaxyKiosk"

    fun apply(activity: Activity) {
        val policy = activity.getSystemService(DevicePolicyManager::class.java) ?: return
        if (!policy.isDeviceOwnerApp(activity.packageName)) return
        val admin = ComponentName(activity, DeviceAdminReceiver::class.java)
        applyRestrictions(policy, admin)
        hideStoresAndBrowsers(policy, admin)
        pinHome(policy, admin, activity)
        disableShadeAndKeyguard(policy, admin)
        policy.setLockTaskPackages(admin, arrayOf(activity.packageName))
        if (policy.isLockTaskPermitted(activity.packageName)) {
            activity.startLockTask()
            hideSystemBars(activity)
        }
    }

    private fun applyRestrictions(
        policy: DevicePolicyManager,
        admin: ComponentName,
    ) {
        try {
            policy.setPermissionPolicy(admin, DevicePolicyManager.PERMISSION_POLICY_AUTO_DENY)
        } catch (error: SecurityException) {
            Log.w(TAG, "Permission policy was rejected", error)
        }
        for (restriction in KidTabletPolicy.userRestrictions) {
            try {
                // API 37 keeps addUserRestriction. The boolean form is gone.
                policy.addUserRestriction(admin, restriction)
            } catch (error: SecurityException) {
                Log.w(TAG, "Restriction was rejected: $restriction", error)
            }
        }
    }

    private fun hideStoresAndBrowsers(
        policy: DevicePolicyManager,
        admin: ComponentName,
    ) {
        for (packageName in KidTabletPolicy.packagesToHide) {
            try {
                policy.setApplicationHidden(admin, packageName, true)
            } catch (error: SecurityException) {
                Log.w(TAG, "Could not hide $packageName", error)
            } catch (error: IllegalArgumentException) {
                Log.w(TAG, "Could not hide $packageName", error)
            }
        }
    }

    private fun pinHome(
        policy: DevicePolicyManager,
        admin: ComponentName,
        activity: Activity,
    ) {
        val filter =
            IntentFilter(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                addCategory(Intent.CATEGORY_DEFAULT)
            }
        try {
            policy.addPersistentPreferredActivity(
                admin,
                filter,
                ComponentName(activity, activity.javaClass),
            )
        } catch (error: SecurityException) {
            Log.w(TAG, "Home pin was rejected", error)
        }
    }

    private fun disableShadeAndKeyguard(
        policy: DevicePolicyManager,
        admin: ComponentName,
    ) {
        try {
            policy.setKeyguardDisabled(admin, true)
            policy.setStatusBarDisabled(admin, true)
            if (Build.VERSION.SDK_INT >= KidTabletPolicy.FULL_LOCK_API) {
                policy.setLockTaskFeatures(admin, DevicePolicyManager.LOCK_TASK_FEATURE_NONE)
            }
        } catch (error: SecurityException) {
            Log.w(TAG, "Shade or keyguard change was rejected", error)
        }
    }

    private fun hideSystemBars(activity: Activity) {
        WindowCompat.setDecorFitsSystemWindows(activity.window, false)
        val controller = WindowInsetsControllerCompat(activity.window, activity.window.decorView)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_DEFAULT
    }
}
