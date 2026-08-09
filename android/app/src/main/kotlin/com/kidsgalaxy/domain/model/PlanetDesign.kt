package com.kidsgalaxy.domain.model

const val DEFAULT_RING_COLOR_ARGB: Int = 0xFFD8A6FF.toInt()

/** Physical form chosen before drawing begins. The paint texture stays unchanged. */
enum class PlanetStyle(
    val wireValue: String,
) {
    CLASSIC("classic"),
    RINGED("ringed"),
    CRATERED("cratered"),
    SPIKY("spiky"),
}

/** Optional animated objects that travel with the child's planet. */
enum class PlanetCompanion(
    val wireValue: String,
) {
    MOON("moon"),
    STARS("stars"),
    SATELLITE("satellite"),
    ASTRONAUT("astronaut"),
}

/** The non-paint choices that turn a drawing into a small animated world. */
data class PlanetDesign(
    val style: PlanetStyle = PlanetStyle.CLASSIC,
    val companions: Set<PlanetCompanion> = emptySet(),
    val ringColorArgb: Int = DEFAULT_RING_COLOR_ARGB,
)
