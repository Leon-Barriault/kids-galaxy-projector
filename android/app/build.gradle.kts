import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Kotlin 2.x replaced the android { kotlinOptions { } } block with this DSL.
kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

/**
 * Deployment settings are read from Gradle properties so a site can be
 * reconfigured without editing source. Override in `local.properties`,
 * `~/.gradle/gradle.properties`, or on the command line:
 *
 *   ./gradlew assembleRelease -PkidsGalaxyServerHost=10.42.0.1 \
 *       -PkidsGalaxyCertPassword=<install-time password>
 */
val serverHost: String =
    (project.findProperty("kidsGalaxyServerHost") as String?) ?: "10.42.0.1"
val httpPort: String = (project.findProperty("kidsGalaxyHttpPort") as String?) ?: "8000"
val httpsPort: String = (project.findProperty("kidsGalaxyHttpsPort") as String?) ?: "8443"
val certPassword: String =
    (project.findProperty("kidsGalaxyCertPassword") as String?) ?: "KidsGalaxy"

android {
    namespace = "com.kidsgalaxy"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.kidsgalaxy"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        // Injected so the host is defined in exactly one place (also used by
        // network_security_config.xml via manifest placeholder).
        manifestPlaceholders["serverHost"] = serverHost
        buildConfigField("String", "CLIENT_CERT_PASSWORD", "\"$certPassword\"")
    }

    buildTypes {
        debug {
            // Lab / development: plain HTTP against the Pi or Docker stack.
            buildConfigField("String", "SERVER_BASE_URL", "\"http://$serverHost:$httpPort/\"")
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

    buildFeatures {
        compose = true
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
    // The BOM pins every androidx.compose.* artifact, so those are declared
    // without versions below.
    val composeBom = platform("androidx.compose:compose-bom:2026.06.01")
    implementation(composeBom)

    implementation("androidx.core:core-ktx:1.19.0")
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.11.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.11.0")

    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")

    // Networking. Retrofit 3 requires OkHttp 5; keep the two in step.
    implementation("com.squareup.retrofit2:retrofit:3.0.0")
    implementation("com.squareup.retrofit2:converter-gson:3.0.0")
    implementation("com.squareup.okhttp3:logging-interceptor:5.4.0")

    debugImplementation("androidx.compose.ui:ui-tooling")

    // JVM unit tests - the domain and presentation layers need no emulator.
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.1")
}
