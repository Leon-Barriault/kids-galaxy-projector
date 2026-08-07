package com.kidsgalaxy.domain.render

import com.kidsgalaxy.domain.model.Drawing

/**
 * Port: turns a drawing into PNG bytes ready to upload.
 *
 * Returning a ByteArray rather than an Android Bitmap or File keeps this
 * declaration framework-free, so the domain and the use cases stay independent
 * of `android.graphics`.
 */
interface PlanetTextureRenderer {
    fun renderPng(drawing: Drawing): ByteArray
}
