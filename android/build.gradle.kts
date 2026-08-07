plugins {
    id("com.android.application") version "9.3.1" apply false
    // AGP 9+ ships built-in Kotlin — do not apply org.jetbrains.kotlin.android
    id("org.jetbrains.kotlin.plugin.compose") version "2.4.10" apply false
}
