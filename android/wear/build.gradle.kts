import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The Wear OS app: today's habits on the watch, tap to check in, and a watch-face complication.
// Same applicationId as the phone app so the Wearable Data Layer delivers the phone's settings.
android {
    namespace = "app.openhabit.wear"
    compileSdk = 36

    defaultConfig {
        applicationId = "app.openhabit.widget"
        minSdk = 30
        targetSdk = 34
        versionCode = 2
        versionName = "0.2.0"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }

dependencies {
    implementation(project(":core"))
    implementation("com.google.android.gms:play-services-wearable:19.0.0")
    implementation("androidx.wear.watchface:watchface-complications-data-source-ktx:1.2.1")
}
