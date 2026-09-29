package com.tamem.delivery

import android.app.Application
import android.content.Context
import android.content.res.Configuration

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactNativeHost

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
      this,
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // Packages that cannot be autolinked yet can be added manually here, for example:
              // add(MyReactNativePackage())
            }

          override fun getJSMainModuleName(): String = ".expo/.virtual-metro-entry"

          override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

          override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
      }
  )

  override val reactHost: ReactHost
    get() = ReactNativeHostWrapper.createReactHost(applicationContext, reactNativeHost)

  /**
   * Pin the layout direction to RTL before React starts.
   *
   * App.tsx calls I18nManager.forceRTL(true), but that only writes the flag —
   * the direction React lays out with is read once, natively, at startup. So a
   * fresh install (and, as we saw, a reinstall that drops the flag) paints the
   * whole app mirrored, and it does not always heal on the next launch. These
   * are the same preferences I18nManager writes, set early enough to count.
   */
  private fun pinRtl() {
    val prefs = getSharedPreferences(
        "com.facebook.react.modules.i18nmanager.I18nUtil", Context.MODE_PRIVATE)
    if (prefs.getBoolean("RCTI18nUtil_forceRTL", false) &&
        prefs.getBoolean("RCTI18nUtil_allowRTL", false)) return
    prefs.edit()
        .putBoolean("RCTI18nUtil_allowRTL", true)
        .putBoolean("RCTI18nUtil_forceRTL", true)
        .commit()
  }

  override fun onCreate() {
    super.onCreate()
    pinRtl()
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
