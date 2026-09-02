# ProGuard / R8 rules for the release build.
#
# R8 is ON (android.enableMinifyInReleaseBuilds in gradle.properties). React
# Native and Expo find a lot of code by NAME at runtime — native modules are
# looked up reflectively, and Expo modules are registered from generated
# metadata — so anything R8 renames or deletes because "nothing calls it"
# disappears in a way that only shows up as a crash on a real device, never at
# build time. These rules name what must survive.
#
# If a release build ever crashes with ClassNotFoundException /
# NoSuchMethodException and the debug build is fine, this file is the first
# place to look. The escape hatch is one line:
#   android.enableMinifyInReleaseBuilds=false   (in gradle.properties)

# ─── React Native core ──────────────────────────────────────────────────────
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep @com.facebook.proguard.annotations.DoNotStrip class * { *; }
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
    @com.facebook.common.internal.DoNotStrip *;
}
# JNI boundary: these are called from C++, so nothing in Java "uses" them.
-keepclasseswithmembernames,includedescriptorclasses class * {
    native <methods>;
}
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.facebook.react.uimanager.** { *; }
-keep class com.facebook.hermes.** { *; }
-keepclassmembers class *  { @com.facebook.react.uimanager.annotations.ReactProp <methods>; }
-keepclassmembers class *  { @com.facebook.react.uimanager.annotations.ReactPropGroup <methods>; }
# Every ReactPackage is instantiated by name from the generated package list.
-keep class * implements com.facebook.react.ReactPackage { *; }
-keep class * extends com.facebook.react.bridge.NativeModule { *; }
-keep class * extends com.facebook.react.bridge.ReactContextBaseJavaModule { *; }
-keep class * extends com.facebook.react.uimanager.ViewManager { *; }

# ─── Expo ───────────────────────────────────────────────────────────────────
# Expo modules are discovered through generated metadata and reflection.
-keep class expo.modules.** { *; }
-keep class * extends expo.modules.core.interfaces.Package { *; }
-keep class * extends expo.modules.kotlin.modules.Module { *; }
-keepclassmembers class * extends expo.modules.kotlin.modules.Module { *; }
-keep class com.tamem.delivery.** { *; }

# ─── Native modules this app actually ships ─────────────────────────────────
-keep class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.gesturehandler.** { *; }
-keep class com.swmansion.rnscreens.** { *; }
-keep class com.th3rdwave.safeareacontext.** { *; }
-keep class com.reactnativecommunity.** { *; }
-keep class com.rnmaps.** { *; }
-keep class com.google.android.gms.maps.** { *; }
-keep class com.airbnb.android.react.maps.** { *; }
-keep class com.oblador.** { *; }
-keep class com.horcrux.svg.** { *; }
-keep class com.reactnativegooglesignin.** { *; }

# ─── Firebase / Play services (push) ────────────────────────────────────────
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**
-dontwarn com.google.firebase.**

# ─── Kotlin / coroutines / OkHttp ───────────────────────────────────────────
-keep class kotlin.Metadata { *; }
-keepclassmembers class kotlinx.coroutines.** { volatile <fields>; }
-dontwarn kotlinx.coroutines.**
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**

# Keep annotations + generic signatures — Expo's argument coercion reads them.
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod, Exceptions

# Line numbers in a stack trace from a customer's crash report are worth more
# than the handful of bytes they cost.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
