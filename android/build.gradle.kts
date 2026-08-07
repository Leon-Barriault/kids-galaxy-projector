// Toolchain versions. AGP 9.3 requires Gradle >= 9.5 (see gradle-wrapper.properties,
// pinned to 9.7.0) and the Compose compiler plugin tracks the Kotlin version.
plugins {
    id("com.android.application") version "9.3.0" apply false
    id("org.jetbrains.kotlin.android") version "2.4.10" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.4.10" apply false
}
