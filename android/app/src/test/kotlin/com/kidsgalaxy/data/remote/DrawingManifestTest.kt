package com.kidsgalaxy.data.remote

import com.google.gson.JsonParser
import com.kidsgalaxy.domain.model.CanvasSize
import com.kidsgalaxy.domain.model.Drawing
import com.kidsgalaxy.domain.model.Point
import com.kidsgalaxy.domain.model.StrokePath
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DrawingManifestTest {
    @Test
    fun `manifest keeps background and authored stroke geometry but not synthetic fill`() {
        val drawing =
            Drawing(canvasSize = CanvasSize(1000f, 500f))
                .fillBackground(0xFF112233.toInt())
                .addStroke(
                    StrokePath(
                        points = listOf(Point(100f, 50f), Point(900f, 450f)),
                        colorArgb = 0xFFFF8800.toInt(),
                        strokeWidth = 40f,
                    ),
                )

        val json = JsonParser.parseString(DrawingManifestSerializer.toJson(drawing)).asJsonObject

        assertEquals(1, json["version"].asInt)
        assertEquals("normalized-canvas-v1", json["coordinate_space"].asString)
        assertEquals("#112233", json["background_color"].asString)
        assertTrue(json["background_explicit"].asBoolean)
        assertEquals(1, json["strokes"].asJsonArray.size())

        val stroke = json["strokes"].asJsonArray[0].asJsonObject
        assertEquals("#ff8800", stroke["color"].asString)
        assertEquals(40f, stroke["width_px"].asFloat, 0.001f)
        assertEquals(0.08f, stroke["width_normalized"].asFloat, 0.001f)
        assertEquals(0.1f, stroke["points"].asJsonArray[0].asJsonArray[0].asFloat, 0.001f)
        assertEquals(0.1f, stroke["points"].asJsonArray[0].asJsonArray[1].asFloat, 0.001f)
        assertFalse(stroke.has("isBackgroundFill"))
    }
}
