// Toolchain versions.
//
// NOTE: deliberately still on AGP 8.x. AGP 9 enables built-in Kotlin *and* a new
// DSL, and the org.jetbrains.kotlin.android plugin is incompatible with both -
// moving to 9.x is a migration (Compose compiler plugin interaction, KGP version
// alignment), not a version bump, and it needs someone who can run Gradle
// locally. See UNRELEASED.md.
plugins {
    id("com.android.application") version "8.9.1" apply false
    id("org.jetbrains.kotlin.android") version "2.1.10" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.1.10" apply false
}
