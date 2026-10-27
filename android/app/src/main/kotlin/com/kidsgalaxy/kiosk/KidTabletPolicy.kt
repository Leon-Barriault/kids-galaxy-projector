package com.kidsgalaxy.kiosk

/**
 * Device-owner rules for a tablet used by young children.
 *
 * The strings match the platform restriction names so tests can check them
 * without a device. Debugging stays allowed: a grown-up with the USB cable
 * is the recovery door, because this project does not use a paid manager.
 * Wi-Fi changes stay allowed at the platform layer. Lock mode is what keeps
 * children out of Settings.
 */
object KidTabletPolicy {
    /** Android 9. Older tablets can still pin the app. The shade block is stronger here. */
    const val FULL_LOCK_API = 28

    const val BOOT_DELAY_MS = 4_000L

    val bootActions: Set<String> =
        setOf(
            "android.intent.action.BOOT_COMPLETED",
            "android.intent.action.LOCKED_BOOT_COMPLETED",
            "android.intent.action.MY_PACKAGE_REPLACED",
        )

    val userRestrictions: List<String> =
        listOf(
            "no_install_apps",
            "no_install_unknown_sources",
            "no_uninstall_apps",
            "no_modify_accounts",
            "no_add_user",
            "no_factory_reset",
            "no_safe_boot",
            "no_fun",
            "no_config_bluetooth",
            "no_config_credentials",
            "no_share_location",
            "no_outgoing_calls",
            "no_sms",
            "no_usb_file_transfer",
        )

    val packagesToHide: List<String> =
        listOf(
            "com.android.vending",
            "com.google.android.feedback",
            "com.android.chrome",
            "com.android.browser",
            "com.sec.android.app.sbrowser",
            "org.mozilla.firefox",
            "com.microsoft.emmx",
            "com.amazon.venezia",
            "com.amazon.cloud9",
            "com.google.android.youtube",
            "com.google.android.apps.youtube.kids",
        )

    fun launchesOnBoot(action: String?): Boolean = action != null && action in bootActions
}
