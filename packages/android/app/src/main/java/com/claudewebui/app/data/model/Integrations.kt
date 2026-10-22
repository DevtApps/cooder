package com.claudewebui.app.data.model

import kotlinx.serialization.Serializable

// ============================================================================
// Integrations
// ============================================================================

@Serializable
data class ComfyUiSettings(
    val url: String = "",
    val enabled: Boolean = false,
)

/**
 * Discord alert settings.
 *
 * Only `*Configured` booleans and a masked webhook preview cross the wire — the
 * bot token and full webhook URL never leave the server, so there is nothing
 * here to render as a secret.
 */
@Serializable
data class DiscordSettings(
    val enabled: Boolean = false,
    val configured: Boolean = false,
    val transport: String = "",
    val webhookConfigured: Boolean = false,
    val botTokenConfigured: Boolean = false,
    val channelId: String? = null,
    val channelLabel: String? = null,
    val minSeverity: String = "",
    val gatewayMode: String = "",
    val outboxPending: Int = 0,
    val outboxFailed: Int = 0,
    val lastSentAt: String? = null,
    val lastError: String? = null,
)

@Serializable
data class HomeAssistantSettings(
    val enabled: Boolean = false,
    val configured: Boolean = false,
    val baseUrl: String = "",
    val accessTokenConfigured: Boolean = false,
)

/**
 * Write payloads for the integration settings. Secrets are write-only: the
 * server never returns them, and omitting a field leaves it untouched. The
 * explicit `clear*` flags are the only way to remove a stored secret.
 */
@Serializable
data class UpdateDiscordSettingsInput(
    val enabled: Boolean? = null,
    val transport: String? = null,
    val webhookUrl: String? = null,
    val clearWebhookUrl: Boolean? = null,
    val botToken: String? = null,
    val clearBotToken: Boolean? = null,
    val channelId: String? = null,
    val minSeverity: String? = null,
)

@Serializable
data class UpdateHomeAssistantSettingsInput(
    val enabled: Boolean? = null,
    val baseUrl: String? = null,
    val accessToken: String? = null,
    val clearAccessToken: Boolean? = null,
)
