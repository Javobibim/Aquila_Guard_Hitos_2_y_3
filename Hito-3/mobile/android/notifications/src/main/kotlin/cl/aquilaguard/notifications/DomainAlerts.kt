package cl.aquilaguard.notifications

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import cl.aquilaguard.core.DomainAssessment
import cl.aquilaguard.core.DomainRisk

object DomainAlerts {
    private const val SIGNALS = "dns_signals"
    private const val SIGNALS_BANNER = "dns_signals_banner"
    private const val REPORTS = "dns_reports"
    private const val REPORTS_TONE = "dns_reports_tone"
    private const val DEMO_ID = 23
    private const val LOGIN_CHANNEL = "login_notice"
    private const val LOGIN_ID = 24

    fun loginNoticesEnabled(context: Context): Boolean =
        context.getSharedPreferences("login_notices", Context.MODE_PRIVATE).getBoolean("enabled", true)

    fun setLoginNoticesEnabled(context: Context, enabled: Boolean) {
        context.getSharedPreferences("login_notices", Context.MODE_PRIVATE).edit()
            .putBoolean("enabled", enabled)
            .apply()
        if (!enabled) dismissLoginNotice(context)
    }

    fun dismissLoginNotice(context: Context) {
        context.getSystemService(NotificationManager::class.java).cancel(LOGIN_ID)
    }

    fun postLoginNotice(context: Context, hostname: String, icon: Int, dismiss: PendingIntent): Boolean {
        val manager = context.getSystemService(NotificationManager::class.java)
        if (!manager.areNotificationsEnabled()) return false
        val channel = NotificationChannel(LOGIN_CHANNEL, "Recordatorios de inicio de sesión", NotificationManager.IMPORTANCE_HIGH)
        channel.setSound(null, null)
        channel.enableVibration(false)
        manager.createNotificationChannel(channel)
        if (manager.getNotificationChannel(LOGIN_CHANNEL)?.importance == NotificationManager.IMPORTANCE_NONE) return false

        val notification = Notification.Builder(context, LOGIN_CHANNEL)
            .setSmallIcon(icon)
            .setContentTitle("Antes de iniciar sesión")
            .setContentText("Comprueba la dirección oficial antes de ingresar tus datos.")
            .setStyle(Notification.BigTextStyle().bigText(
                "Dominio consultado: $hostname. Si vas a iniciar sesión, comprueba que la dirección sea la oficial."
            ))
            .setVisibility(Notification.VISIBILITY_SECRET)
            .setOngoing(true)
            .setTimeoutAfter(120_000)
            .addAction(Notification.Action.Builder(null, "Entendido", dismiss).build())
            .build()
        return try {
            manager.notify(LOGIN_ID, notification)
            true
        } catch (_: SecurityException) {
            false
        }
    }

    fun createChannels(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.headsUpChannel(SIGNALS, SIGNALS_BANNER, "Señales de suplantación")
        reportChannel(context, manager)
    }

    private fun reportChannel(context: Context, manager: NotificationManager): String {
        val settings = HighRiskAlertSettings.load(context)
        val mode = if (settings.vibrate) "vibration" else "sound"
        val soundProfile = if (settings.soundEnabled) settings.tone.key else "silent"
        val id = "dns_high_${soundProfile}_$mode"
        if (manager.getNotificationChannel(id) != null) return id
        val previous = manager.getNotificationChannel(REPORTS_TONE) ?: manager.getNotificationChannel(REPORTS)
        val importance = previous?.importance ?: NotificationManager.IMPORTANCE_HIGH
        val label = if (settings.soundEnabled) settings.tone.label else "Sin sonido"
        val suffix = if (settings.vibrate) " con vibración" else ""
        val channel = NotificationChannel(id, "Riesgo alto · $label$suffix", importance)
        if (settings.soundEnabled) {
            val tone = Uri.parse("android.resource://${context.packageName}/raw/aquila_risk_${settings.tone.key}")
            val audio = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            channel.setSound(tone, audio)
        } else {
            channel.setSound(null, null)
        }
        if (settings.vibrate) {
            channel.vibrationPattern = longArrayOf(0, 160)
        } else {
            channel.enableVibration(false)
        }
        manager.createNotificationChannel(channel)
        return id
    }

    private fun channelFor(context: Context, manager: NotificationManager, reported: Boolean): String =
        if (reported) {
            reportChannel(context, manager)
        } else {
            val signals = manager.headsUpChannel(SIGNALS, SIGNALS_BANNER, "Señales de suplantación")
            manager.withSoundPreference(context, signals)
        }

    fun postMessage(context: Context, source: String, risk: DomainRisk, reasons: List<String>, icon: Int, open: PendingIntent) {
        if (risk == DomainRisk.NO_MATCH) return
        val manager = context.getSystemService(NotificationManager::class.java)
        if (!manager.areNotificationsEnabled()) return
        val reported = risk == DomainRisk.REPORTED
        val channel = channelFor(context, manager, reported)
        if (manager.getNotificationChannel(channel)?.importance == NotificationManager.IMPORTANCE_NONE) return
        val title = if (reported) "Riesgo alto en $source" else "Precaución en $source"
        val advice = "Verifica el mensaje por un canal oficial antes de abrir enlaces o entregar datos."
        val alert = Notification.Builder(context, channel)
            .setSmallIcon(icon)
            .setContentTitle(title)
            .setContentText(reasons.firstOrNull() ?: advice)
            .setStyle(Notification.BigTextStyle().bigText((reasons + advice).joinToString("\n\n")))
            .setContentIntent(open)
            .setVisibility(Notification.VISIBILITY_SECRET)
            .setAutoCancel(true)
            .build()
        try {
            manager.notify(source, if (reported) 31 else 30, alert)
        } catch (_: SecurityException) {
            // Notification permission may have been revoked after the precheck.
        }
    }

    fun clearMessageAlerts(context: Context, source: String) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.cancel(source, 30)
        manager.cancel(source, 31)
    }

    fun post(context: Context, assessment: DomainAssessment, icon: Int, open: PendingIntent?, demo: Boolean = false): Boolean {
        if (assessment.risk == DomainRisk.NO_MATCH) return false
        val reported = assessment.risk == DomainRisk.REPORTED
        val manager = context.getSystemService(NotificationManager::class.java)
        val channel = channelFor(context, manager, reported)
        val importance = manager.getNotificationChannel(channel)?.importance ?: NotificationManager.IMPORTANCE_NONE
        if (!manager.areNotificationsEnabled() || importance == NotificationManager.IMPORTANCE_NONE) {
            return false
        }
        val title = when {
            demo -> "Prueba simulada · Riesgo alto"
            reported -> "Riesgo alto · Dominio reportado"
            else -> "Precaución · Posible suplantación"
        }
        val advice = if (demo) {
            "La simulación usa el sonido y la vibración que elegiste para riesgo alto."
        } else if (reported) {
            "Si ves este dominio en la barra del navegador, cierra la pestaña. Evita entregar claves o hacer pagos. Usa un canal oficial que conozcas."
        } else {
            "Comprueba el dominio en la barra del navegador antes de ingresar datos. Si tienes dudas, entra desde la dirección oficial."
        }
        val notification = Notification.Builder(context, channel)
            .setSmallIcon(icon)
            .setContentTitle(title)
            .setContentText(assessment.hostname)
            .setStyle(Notification.BigTextStyle().bigText(listOf(assessment.hostname, assessment.reasons.joinToString(" "), advice).joinToString("\n\n")))
            .setContentIntent(open)
            .setVisibility(Notification.VISIBILITY_SECRET)
            .setAutoCancel(true)
            .build()
        return try {
            if (demo) manager.cancel(DEMO_ID)
            manager.notify(if (demo) DEMO_ID else if (reported) 21 else 20, notification)
            true
        } catch (_: SecurityException) {
            // Android can revoke notification permission while the service is running.
            false
        }
    }
}

internal fun NotificationManager.withSoundPreference(context: Context, originalId: String): String {
    if (HighRiskAlertSettings.load(context).soundEnabled) return originalId
    val original = getNotificationChannel(originalId) ?: return originalId
    val id = "${originalId}_silent"
    if (getNotificationChannel(id) == null) {
        val channel = NotificationChannel(id, "${original.name} · Sin sonido", original.importance)
        channel.setSound(null, null)
        channel.enableVibration(false)
        createNotificationChannel(channel)
    }
    return id
}

internal fun NotificationManager.headsUpChannel(previousId: String, newId: String, label: String): String {
    if (getNotificationChannel(newId) != null) return newId
    val previous = getNotificationChannel(previousId)
    // Android keeps channel importance across app updates. Preserve the user's prior choices.
    if (previous != null && (previous.importance != NotificationManager.IMPORTANCE_DEFAULT ||
            Build.VERSION.SDK_INT >= 29 && previous.hasUserSetImportance())
    ) return previousId
    createNotificationChannel(NotificationChannel(newId, label, NotificationManager.IMPORTANCE_HIGH))
    return newId
}
