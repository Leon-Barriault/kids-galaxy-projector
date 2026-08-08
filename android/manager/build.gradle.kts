import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

val localProperties =
    Properties().apply {
        val file = rootProject.file("local.properties")
        if (file.exists()) {
            file.inputStream().use { load(it) }
        }
    }

fun setting(
    name: String,
    default: String,
): String =
    (project.findProperty(name) as String?)
        ?: localProperties.getProperty(name)
        ?: default

val debugServerHost: String = setting("kidsGalaxyDebugServerHost", "10.0.2.2")
val serverHost: String = setting("kidsGalaxyServerHost", "10.42.0.1")
val httpPort: String = setting("kidsGalaxyHttpPort", "8000")
val httpsPort: String = setting("kidsGalaxyHttpsPort", "8443")

android {
    namespace = "com.kidsgalaxy.manager"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.kidsgalaxy.manager"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
        manifestPlaceholders["serverHost"] = serverHost
    }

    buildTypes {
        debug {
            buildConfigField("String", "SERVER_BASE_URL", "\"http://$debugServerHost:$httpPort/\"")
            manifestPlaceholders["serverHost"] = debugServerHost
        }
        release {
            buildConfigField("String", "SERVER_BASE_URL", "\"https://$serverHost:$httpsPort/\"")
            isMinifyEnabled = false
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
        buildConfig = true
    }

    sourceSets {
        getByName("main") { java.srcDirs("src/main/kotlin") }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2026.06.01")
    implementation(composeBom)

    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.11.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.11.0")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")

    implementation("com.squareup.retrofit2:retrofit:3.0.0")
    implementation("com.squareup.retrofit2:converter-gson:3.0.0")
    implementation(platform("com.squareup.okhttp3:okhttp-bom:5.4.0"))
    implementation("com.squareup.okhttp3:okhttp")
    implementation("com.squareup.okhttp3:logging-interceptor")

    implementation("io.coil-kt:coil-compose:2.7.0")

    debugImplementation("androidx.compose.ui:ui-tooling")
}
