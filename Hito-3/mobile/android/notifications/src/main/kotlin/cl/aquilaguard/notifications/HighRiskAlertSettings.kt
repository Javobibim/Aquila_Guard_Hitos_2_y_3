package cl.aquilaguard.notifications

import android.content.Context

enum class HighRiskTone(val key: String, val label: String) {
    DESCENDING("descending", "Alerta descendente"),
    IMPACT("impact", "Doble impacto"),
    BELL("bell", "Campana grave"),
    PULSE("pulse", "Pulso rápido"),
    ECHO("echo", "Golpe y eco")
}

data class HighRiskAlertSettings(
    val tone: HighRiskTone = HighRiskTone.DESCENDING,
    val vibrate: Boolean = false,
    val soundEnabled: Boolean = true
) {
    fun save(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("tone", tone.key)
            .putBoolean("vibrate", vibrate)
            .putBoolean("sound_enabled", soundEnabled)
            .apply()
    }

    companion object {
        private const val PREFS = "high_risk_alert"

        fun load(context: Context): HighRiskAlertSettings {
            val preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val key = preferences.getString("tone", null)
            return HighRiskAlertSettings(
                tone = HighRiskTone.entries.firstOrNull { it.key == key } ?: HighRiskTone.DESCENDING,
                vibrate = preferences.getBoolean("vibrate", false),
                soundEnabled = preferences.getBoolean("sound_enabled", true)
            )
        }
    }
}
