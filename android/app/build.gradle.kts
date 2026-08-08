import java.util.Properties

plugins {
    id("com.android.application")
    // Compose compiler plugin (Kotlin itself is built into AGP 9+)
    id("org.jetbrains.kotlin.plugin.compose")
}

/**
 * Gradle does NOT read `local.properties` as project properties - the Android
 * plugin only looks in it for `sdk.dir`. So load it explicitly, otherwise a
 * `kidsGalaxyServerHost` put there would be silently ignored and the app would
 * quietly keep pointing at the Pi.
 */
val localProperties =
    Properties().apply {
        val file = rootProject.file("local.properties")
        if (file.exists()) {
            file.inputStream().use { load(it) }
        }
    }

/**
 * Resolution order, most specific first:
 *
 *   1. -P on the command line, or gradle.properties  (release builds use this)
 *   2. local.properties                              (per machine overrides)
 *   3. the default below                             (works with no setup)
 */
fun setting(
    name: String,
    default: String,
): String =
    (project.findProperty(name) as String?)
        ?: localProperties.getProperty(name)
        ?: default

/**
 * Release / field deployment: the Raspberry Pi's hotspot address.
 *
 *   ./gradlew assembleRelease -PkidsGalaxyServerHost=10.42.0.1 \
 *       -PkidsGalaxyCertPassword=<install-time password>
 */
val serverHost: String = setting("kidsGalaxyServerHost", "10.42.0.1")

/**
 * Debug / desk work, kept separate on purpose. Sharing one host between the
 * variants meant that setting a local address for debugging also followed a
 * release build made on the same machine - silently, because a release build
 * gives no clue which host was compiled into it. 10.0.2.2 is the emulator's
 * fixed alias for the host machine's loopback, so `docker compose up` at the
 * repo root is reachable with no configuration at all.
 *
 * On a physical tablet, set kidsGalaxyDebugServerHost to this machine's LAN
 * address in local.properties.
 */
val debugServerHost: String = setting("kidsGalaxyDebugServerHost", "10.0.2.2")

val httpPort: String = setting("kidsGalaxyHttpPort", "8000")
val httpsPort: String = setting("kidsGalaxyHttpsPort", "8443")
val certPassword: String = setting("kidsGalaxyCertPassword", "KidsGalaxy")

android {
    namespace = "com.kidsgalaxy"

    // androidx.lifecycle 2.11 requires compiling against API 37 or later.
    // compileSdk only controls which APIs are available at compile time; the
    // runtime behaviour opt-in is targetSdk, kept at 36 deliberately.
    compileSdk = 37

    defaultConfig {
        applicationId = "com.kidsgalaxy"
        minSdk = 26
        targetSdk = 36
        versionCode = 2
        versionName = "1.1.0"

        buildConfigField("String", "CLIENT_CERT_PASSWORD", "\"$certPassword\"")
    }

    buildTypes {
        debug {
            // Lab / development: plain HTTP against the Docker stack or the Pi.
            buildConfigField("String", "SERVER_BASE_URL", "\"http://$debugServerHost:$httpPort/\"")
            buildConfigField("boolean", "USE_MTLS", "false")
        }
        release {
            // Field deployment: certificate-authenticated HTTPS (mTLS).
            buildConfigField("String", "SERVER_BASE_URL", "\"https://$serverHost:$httpsPort/\"")
            buildConfigField("boolean", "USE_MTLS", "true")

            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlin {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        }
    }

    buildFeatures {
        compose = true
        // ApiClient reads BuildConfig.SERVER_BASE_URL / USE_MTLS /
        // CLIENT_CERT_PASSWORD / DEBUG, so this must stay enabled.
        buildConfig = true
    }

    // Sources live under src/{main,test}/kotlin rather than .../java.
    sourceSets {
        getByName("main") { java.srcDirs("src/main/kotlin") }
        getByName("test") { java.srcDirs("src/test/kotlin") }
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
            all { it.testLogging { events("passed", "skipped", "failed") } }
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2026.06.01")
    implementation(composeBom)

    implementation(project(":connection"))
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.11.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.11.0")

    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")

    implementation("com.squareup.retrofit2:retrofit:3.0.0")
    implementation("com.squareup.retrofit2:converter-gson:3.0.0")
    implementation(platform("com.squareup.okhttp3:okhttp-bom:5.4.0"))
    implementation("com.squareup.okhttp3:okhttp")
    implementation("com.squareup.okhttp3:logging-interceptor")

    debugImplementation("androidx.compose.ui:ui-tooling")

    // JVM unit tests - the domain and presentation layers need no emulator.
    // Without these the four test sources under src/test/kotlin cannot compile.
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.1")
}
