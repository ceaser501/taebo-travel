// 딱복트립 걸음 수: a small Android app that sends the day's steps (from Health Connect, where Samsung Health
// shares them) to the trip, so 딱복트립 can show them. Built by .github/workflows/steps-app.yml.
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "ttakbok-steps"
include(":app")
