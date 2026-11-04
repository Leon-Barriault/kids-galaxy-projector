package com.kidsgalaxy.kiosk

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class KidTabletPolicyTest {
    @Test
    fun `boots the drawing app after power on and after an update`() {
        assertTrue(KidTabletPolicy.launchesOnBoot("android.intent.action.BOOT_COMPLETED"))
        assertTrue(KidTabletPolicy.launchesOnBoot("android.intent.action.LOCKED_BOOT_COMPLETED"))
        assertTrue(KidTabletPolicy.launchesOnBoot("android.intent.action.MY_PACKAGE_REPLACED"))
        assertFalse(KidTabletPolicy.launchesOnBoot(null))
        assertFalse(KidTabletPolicy.launchesOnBoot("android.intent.action.ACTION_POWER_CONNECTED"))
    }

    @Test
    fun `blocks stores accounts and installs and leaves the usb door open`() {
        assertTrue(KidTabletPolicy.userRestrictions.contains("no_install_apps"))
        assertTrue(KidTabletPolicy.userRestrictions.contains("no_modify_accounts"))
        assertTrue(KidTabletPolicy.userRestrictions.contains("no_factory_reset"))
        assertFalse(KidTabletPolicy.userRestrictions.contains("no_debugging_features"))
        assertFalse(KidTabletPolicy.userRestrictions.contains("no_config_wifi"))
    }

    @Test
    fun `hides play store browsers and the amazon store`() {
        assertTrue(KidTabletPolicy.packagesToHide.contains("com.android.vending"))
        assertTrue(KidTabletPolicy.packagesToHide.contains("com.android.chrome"))
        assertTrue(KidTabletPolicy.packagesToHide.contains("com.amazon.venezia"))
        assertTrue(KidTabletPolicy.packagesToHide.contains("com.amazon.cloud9"))
    }

    @Test
    fun `full shade lock starts at android 9`() {
        assertEquals(28, KidTabletPolicy.FULL_LOCK_API)
    }
}
