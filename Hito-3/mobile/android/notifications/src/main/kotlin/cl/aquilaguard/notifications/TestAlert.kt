package cl.aquilaguard.notifications

import android.app.Notification
import android.app.NotificationManager
import android.content.Context

object TestAlert {
    private const val CHANNEL_ID = "security_test"
    private const val BANNER_CHANNEL_ID = "security_test_banner"

    fun post(context: Context, icon: Int): Boolean {
        val manager = context.getSystemService(NotificationManager::class.java)
        val original = manager.headsUpChannel(CHANNEL_ID, BANNER_CHANNEL_ID, "Pruebas de Aquila Guard")
        val channel = manager.withSoundPreference(context, original)
        if (!manager.areNotificationsEnabled() || manager.getNotificationChannel(channel).importance == NotificationManager.IMPORTANCE_NONE) return false

        val explanation = "En este ejemplo, un dominio ficticio imita el nombre de una marca. Es una notificación simulada."
        val notification = Notification.Builder(context, channel)
            .setSmallIcon(icon)
            .setContentTitle("Aquila Guard · Prueba simulada")
            .setContentText("Ejemplo de un dominio parecido al de una marca")
            .setStyle(Notification.BigTextStyle().bigText(explanation))
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setAutoCancel(true)
            .build()
        return try {
            manager.notify(1, notification)
            true
        } catch (_: SecurityException) {
            false
        }
    }
}
