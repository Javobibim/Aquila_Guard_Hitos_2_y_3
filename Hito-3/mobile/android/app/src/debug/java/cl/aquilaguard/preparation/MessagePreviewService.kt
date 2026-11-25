package cl.aquilaguard.preparation

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import cl.aquilaguard.core.DomainRisk
import cl.aquilaguard.data.ThreatRepository
import cl.aquilaguard.detection.MessageEvaluator
import cl.aquilaguard.notifications.DomainAlerts
import java.security.MessageDigest
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

internal enum class MessageSource(val label: String) {
    SMS("Mensajes"),
    GMAIL("Gmail");

    fun enabled(context: Context): Boolean =
        context.getSharedPreferences("message_preview", Context.MODE_PRIVATE).getBoolean(name, false)

    fun setEnabled(context: Context, enabled: Boolean) {
        context.getSharedPreferences("message_preview", Context.MODE_PRIVATE).edit()
            .putBoolean(name, enabled).apply()
        if (!enabled) DomainAlerts.clearMessageAlerts(context, label)
    }
}

class MessagePreviewService : NotificationListenerService() {
    private val worker = ThreadPoolExecutor(1, 1, 0, TimeUnit.SECONDS, ArrayBlockingQueue(8),
        ThreadPoolExecutor.DiscardPolicy())
    private val main = Handler(Looper.getMainLooper())
    private val recent = LinkedHashMap<String, Long>()

    override fun onListenerConnected() {
        connection.value = true
    }

    override fun onListenerDisconnected() {
        connection.value = false
        worker.queue.clear()
        main.removeCallbacksAndMessages(null)
        recent.clear()
    }

    override fun onDestroy() {
        onListenerDisconnected()
        worker.shutdownNow()
        super.onDestroy()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val source = when (sbn.packageName) {
            "com.google.android.apps.messaging", "com.samsung.android.messaging", "com.android.messaging" -> MessageSource.SMS
            "com.google.android.gm" -> MessageSource.GMAIL
            else -> return
        }
        if (!connection.value || !source.enabled(this) ||
            !getSystemService(NotificationManager::class.java).areNotificationsEnabled()) return
        val notification = sbn.notification
        if (notification.flags and (Notification.FLAG_GROUP_SUMMARY or Notification.FLAG_ONGOING_EVENT) != 0) return
        val preview = runCatching { preview(notification, source) }.getOrNull() ?: return
        val key = sbn.key
        worker.execute {
            if (!connection.value || !source.enabled(this)) return@execute
            val review = runCatching { MessageEvaluator(ThreatRepository.load(this).evaluator).review(preview) }
                .getOrNull() ?: return@execute
            if (review.risk == DomainRisk.NO_MATCH) return@execute
            val fingerprint = MessageDigest.getInstance("SHA-256").digest("$key\u0000$preview".toByteArray())
                .joinToString("") { "%02x".format(it) }
            main.post {
                if (!connection.value || !source.enabled(this)) return@post
                val now = SystemClock.elapsedRealtime()
                if (recent[fingerprint]?.let { now - it < 120_000 } == true) return@post
                recent.remove(fingerprint)
                if (recent.size == 128) recent.remove(recent.keys.first())
                recent[fingerprint] = now
                val open = PendingIntent.getActivity(this, 51, Intent(this, MainActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
                DomainAlerts.postMessage(this, source.label, review.risk, review.reasons, R.drawable.ic_alert, open)
            }
        }
    }

    private fun preview(notification: Notification, source: MessageSource): String? {
        val extras = notification.extras ?: return null
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
        val content = when (source) {
            MessageSource.SMS -> {
                val latest = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(notification)
                    ?.messages?.lastOrNull()
                if (latest != null) {
                    if (latest.person == null) return null
                    latest.text?.take(4096)?.toString()
                } else (bigText ?: text)?.take(4096)?.toString()
            }
            MessageSource.GMAIL -> listOfNotNull(text, bigText)
                .map { it.take(2048).toString() }.distinct().joinToString("\n")
        }
        return content?.takeIf { it.isNotBlank() }
    }

    companion object {
        private val connection = MutableStateFlow(false)
        internal val connected = connection.asStateFlow()
    }
}
