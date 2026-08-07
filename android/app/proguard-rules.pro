# Keep Retrofit & Gson
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.kidsgalaxy.network.** { *; }
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}
