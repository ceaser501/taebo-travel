plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.ttakbok.steps"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.ttakbok.steps"
        minSdk = 28 // Health Connect needs Android 9 or later
        targetSdk = 35
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "1.0." + (System.getenv("GITHUB_RUN_NUMBER") ?: "0")
    }

    // The app is installed by hand (not from the Play Store). The build server keeps one signing key in its
    // private cache (never in the repository), so every new version installs over the old one.
    signingConfigs {
        create("steps") {
            storeFile = file(System.getenv("STEPS_KEYSTORE") ?: "signing.keystore")
            storePassword = System.getenv("STEPS_KEY_PASS") ?: ""
            keyAlias = "steps"
            keyPassword = System.getenv("STEPS_KEY_PASS") ?: ""
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("steps")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.health.connect:connect-client:1.1.0")
    implementation("androidx.work:work-runtime-ktx:2.10.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
}
