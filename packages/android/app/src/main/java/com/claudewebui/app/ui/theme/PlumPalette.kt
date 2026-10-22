package com.claudewebui.app.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * The Plum surface palette.
 *
 * The screens paint with these rather than with MaterialTheme's colour scheme,
 * so this — not [ClaudeWebUITheme] — is what has to change for the app to have
 * more than one look. Every colour the UI uses lives here; nothing outside this
 * file should hardcode a surface, text or border colour.
 *
 * Both palettes mirror the Cowork tokens of the new web frontend
 * (`packages/frontend/src/styles/globals.css`): warm off-white in light mode,
 * neutral warm-grey in dark mode, 1 px hairline borders, no glass, no glows and
 * no animated atmosphere. The old frosted-plum looks were retired when the web
 * moved to this single design; the glass/fill fields remain so that the many
 * [com.claudewebui.app.ui.components.common.GlassPanel]-style call sites read
 * as flat opaque cards instead.
 */
data class PlumPalette(
    val background: Color,
    val surface: Color,
    val surfaceStrong: Color,
    val border: Color,
    val borderSoft: Color,
    val text: Color,
    val muted: Color,
    val accent: Color,
    val accentDeep: Color,
    val green: Color,
    val blue: Color,
    val amber: Color,
    val red: Color,
    /** Tint for the hairline grid drawn across the backdrop. */
    val grid: Color,
    /** The two ambient glows behind the backdrop; transparent disables them. */
    val glowPrimary: Color,
    val glowSecondary: Color,
    /** Aurora ribbons from the WebUI backdrop; transparent disables the effect. */
    val waveViolet: Color,
    val waveCyan: Color,
    val waveRose: Color,
    val waveGold: Color,
    /** Fill for raised circular controls such as the header icon buttons. */
    val controlSurface: Color,
    /** Barely-there wash used to lift rows and inner cards off a panel. */
    val subtleFill: Color,
    /** Slightly stronger wash for tracks behind progress bars. */
    val trackFill: Color,
    /** Recessed background of segmented controls (time range, chart metric). */
    val segmentTrack: Color,
    /** Fill and label of the selected segment. */
    val segmentSelected: Color,
    val onSegmentSelected: Color,
    /** Tint behind a selected tab card. */
    val selectionTint: Color,
    // ── Flat surfaces in place of the old frosted glass ─────────────────────
    // The former frosted-glass fields now resolve to the opaque card colour,
    // so glass call sites render as plain Cowork cards with hairline borders.
    val glassFill: Color,
    val glassFillTop: Color,
    val glassHighlight: Color,
    val glassShadow: Color,
    val isLight: Boolean,
)

/** Dark mode: HSL 60 3% 15% background, 48 33% 97% foreground — Cowork `.dark`. */
val PlumDarkPalette = PlumPalette(
    background = Color(0xFF272725),
    surface = Color(0xFF2F2F2D),
    surfaceStrong = Color(0xFF2F2F2D),
    border = Color(0xFF42413D),
    borderSoft = Color(0xFF333330),
    text = Color(0xFFFAF9F5),
    muted = Color(0xFF9C9A91),
    accent = Color(0xFFC7603D),
    accentDeep = Color(0xFFA04C2F),
    green = Color(0xFF35E392),
    blue = Color(0xFF5AA3F6),
    amber = Color(0xFFF5B83D),
    red = Color(0xFFD14747),
    grid = Color.Transparent,
    glowPrimary = Color.Transparent,
    glowSecondary = Color.Transparent,
    waveViolet = Color.Transparent,
    waveCyan = Color.Transparent,
    waveRose = Color.Transparent,
    waveGold = Color.Transparent,
    controlSurface = Color(0xFF2F2F2D),
    subtleFill = Color(0xFF1F1F1E),
    trackFill = Color(0xFF373734),
    segmentTrack = Color(0xFF1F1F1E),
    segmentSelected = Color(0xFFFAF9F5),
    onSegmentSelected = Color(0xFF272725),
    selectionTint = Color(0x24FAF9F5),
    glassFill = Color(0xFF2F2F2D),
    glassFillTop = Color(0xFF2F2F2D),
    glassHighlight = Color.Transparent,
    glassShadow = Color.Transparent,
    isLight = false,
)

/**
 * Light surface: HSL 48 33% 97% background, 60 3% 8% foreground — Cowork
 * `:root`. Accents use the Cowork brand terracotta so that text painted white
 * over `accent` keeps working, matching the web's `--brand` send button.
 */
val PlumLightPalette = PlumPalette(
    background = Color(0xFFFAF9F5),
    surface = Color(0xFFFFFFFF),
    surfaceStrong = Color(0xFFFFFFFF),
    border = Color(0xFFDDDBD5),
    borderSoft = Color(0xFFE7E5DE),
    text = Color(0xFF151514),
    muted = Color(0xFF696863),
    accent = Color(0xFFC7603D),
    accentDeep = Color(0xFFA04C2F),
    green = Color(0xFF219760),
    blue = Color(0xFF1874DC),
    amber = Color(0xFFCE8509),
    red = Color(0xFFDC2828),
    grid = Color.Transparent,
    glowPrimary = Color.Transparent,
    glowSecondary = Color.Transparent,
    waveViolet = Color.Transparent,
    waveCyan = Color.Transparent,
    waveRose = Color.Transparent,
    waveGold = Color.Transparent,
    controlSurface = Color(0xFFFFFFFF),
    subtleFill = Color(0xFFF4F2EC),
    trackFill = Color(0xFFEDEBE3),
    segmentTrack = Color(0xFFF4F2EC),
    segmentSelected = Color(0xFF151514),
    onSegmentSelected = Color(0xFFFAF9F5),
    selectionTint = Color(0x1C151514),
    glassFill = Color(0xFFFFFFFF),
    glassFillTop = Color(0xFFFFFFFF),
    glassHighlight = Color.Transparent,
    glassShadow = Color.Transparent,
    isLight = true,
)

val LocalPlumPalette = staticCompositionLocalOf { PlumDarkPalette }

/**
 * Which palette a stored preference resolves to. [systemInDark] decides the
 * SYSTEM case, so the caller supplies it from `isSystemInDarkTheme()`.
 *
 * E-Ink is gone together with the old web look; a stale `EINK` preference is
 * mapped to light exactly like the web migration does.
 */
fun paletteFor(theme: AppThemeOption, systemInDark: Boolean): PlumPalette = when (theme) {
    AppThemeOption.SYSTEM -> if (systemInDark) PlumDarkPalette else PlumLightPalette
    AppThemeOption.DARK -> PlumDarkPalette
    AppThemeOption.LIGHT -> PlumLightPalette
}

/**
 * Material colour scheme derived from the Plum palette.
 *
 * Several screens — MCP servers, providers, CLI tools, agents, permissions,
 * the file manager — are built entirely on `MaterialTheme.colorScheme` rather
 * than the Plum accessors. Rather than rewrite them, the Material scheme is
 * generated from the same palette so they inherit the active theme and stop
 * rendering in the unrelated default brand colours.
 */
fun PlumPalette.toMaterialScheme(): ColorScheme {
    val base = if (isLight) lightColorScheme() else darkColorScheme()
    return base.copy(
        // The web's --primary is its foreground: black on light, off-white on
        // dark — with onPrimary as the background colour in both.
        primary = text,
        onPrimary = background,
        primaryContainer = subtleFill,
        onPrimaryContainer = text,
        secondary = blue,
        onSecondary = if (isLight) Color.White else Color(0xFF0A1A2A),
        // FilledTonalButton and friends draw from the *container* roles; keep
        // them on the palette's neutral wash so nothing inherits a foreign hue.
        secondaryContainer = subtleFill,
        onSecondaryContainer = text,
        tertiary = accentDeep,
        onTertiary = Color.White,
        tertiaryContainer = subtleFill,
        onTertiaryContainer = text,
        inversePrimary = accentDeep,
        surfaceTint = Color.Transparent,
        inverseSurface = text,
        inverseOnSurface = background,
        background = background,
        onBackground = text,
        surface = surfaceStrong,
        onSurface = text,
        surfaceVariant = subtleFill,
        onSurfaceVariant = muted,
        surfaceContainer = surfaceStrong,
        surfaceContainerHigh = surfaceStrong,
        surfaceContainerHighest = surfaceStrong,
        surfaceContainerLow = background,
        surfaceContainerLowest = background,
        outline = border,
        outlineVariant = borderSoft,
        error = red,
        onError = Color.White,
        errorContainer = red.copy(alpha = .15f),
        onErrorContainer = red,
    )
}
