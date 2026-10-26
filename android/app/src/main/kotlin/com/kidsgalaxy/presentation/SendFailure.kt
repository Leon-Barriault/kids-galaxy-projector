package com.kidsgalaxy.presentation

/**
 * A launch failure the UI can turn into a localized, child-friendly sentence.
 *
 * The ViewModel stays free of Android resources. The Compose layer owns the
 * wording in values/strings.xml and values-fr/strings.xml.
 */
sealed interface SendFailure {
    data object NothingDrawn : SendFailure

    data object RateLimited : SendFailure

    data object InvalidPlanet : SendFailure

    data object Server : SendFailure

    data class Rejected(
        val statusCode: Int,
    ) : SendFailure

    data object Unreachable : SendFailure
}
