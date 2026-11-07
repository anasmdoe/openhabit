import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

// Shared by the phone app and the watch app: the API client, settings and the pure parsing code.
android {
    namespace = "app.openhabit.core"
    compileSdk = 36
    defaultConfig { minSdk = 26 }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    testOptions { unitTests.isReturnDefaultValues = true }
}

kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }

dependencies {
    // The JVM tests bring their own org.json because the SDK's is a stub there.
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
