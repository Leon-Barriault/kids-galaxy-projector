plugins {
    id("com.android.application") version "9.3.1" apply false
    id("com.android.library") version "9.3.1" apply false
    // AGP 9+ ships built-in Kotlin — do not apply org.jetbrains.kotlin.android
    id("org.jetbrains.kotlin.plugin.compose") version "2.4.10" apply false
}

/**
 * One task that produces a working debugging environment, so that pressing
 * Debug in Android Studio is the only manual step.
 *
 * It is wired as a "before launch" step of the "App (local debug)" run
 * configuration, and runs before the APK is installed:
 *
 *   1. builds and starts the pi-server container, detached
 *   2. waits for GET /health, so the app never launches against a server that
 *      is still starting - which presents as a broken app, not a slow one
 *   3. starts an emulator if no device is attached, and waits for it to boot
 *
 * The logic lives in scripts/dev-up.sh and scripts/dev-up.ps1 rather than here.
 * Shell is the right language for orchestrating docker, adb and emulator, the
 * bash version is covered by the same shellcheck gate as the rest of the repo,
 * and both stay runnable without Gradle when something needs debugging on its
 * own. This task is only the entry point that Studio can call.
 *
 * Run it by hand with:  ./gradlew devUp
 */
tasks.register<Exec>("devUp") {
    group = "kids galaxy"
    description = "Start the local debug environment: pi-server container, then an emulator if none is attached."

    // The scripts sit at the repository root, one level above this Gradle
    // project - Studio opens android/, not the repo.
    workingDir(rootProject.projectDir.parentFile)

    if (System.getProperty("os.name").lowercase().contains("windows")) {
        commandLine("powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts\\dev-up.ps1")
    } else {
        commandLine("bash", "scripts/dev-up.sh")
    }
}

/**
 * Companion to devUp: stops the server container but leaves any emulator
 * running, since booting one is the slow part and it is reusable across
 * sessions.
 */
tasks.register<Exec>("devDown") {
    group = "kids galaxy"
    description = "Stop the pi-server container started by devUp."

    workingDir(rootProject.projectDir.parentFile)
    commandLine("docker", "compose", "down")
}
