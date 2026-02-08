# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Capacitor - keep plugin classes and bridge
-keep class com.getcapacitor.** { *; }
-keep class com.astrapedia.app.** { *; }

# Keep JavaScript interface for WebView
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep line number information for debugging stack traces
-keepattributes SourceFile,LineNumberTable

# AndroidX
-keep class androidx.** { *; }
-keep interface androidx.** { *; }
