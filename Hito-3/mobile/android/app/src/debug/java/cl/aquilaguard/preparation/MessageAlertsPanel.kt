package cl.aquilaguard.preparation

import android.Manifest
import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@Composable
internal fun MessageAlertsPanel() {
    val context = LocalContext.current
    val connected by MessagePreviewService.connected.collectAsStateWithLifecycle()
    val manager = context.getSystemService(NotificationManager::class.java)
    var allowedToNotify by remember { mutableStateOf(manager.areNotificationsEnabled()) }
    var settingsFailed by remember { mutableStateOf(false) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { allowedToNotify = manager.areNotificationsEnabled() }
    val requestNotifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        allowedToNotify = manager.areNotificationsEnabled()
    }

    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Avisos de SMS y correo", style = MaterialTheme.typography.titleLarge)
            Text("Beta. Si das permiso, Aquila Guard revisa en este dispositivo el texto que Android muestra en las notificaciones nuevas de las apps que actives. Los textos no se guardan ni se envían.")
            Text("Activa la fuente, concede acceso en Ajustes y permite las alertas de Aquila Guard. Los mensajes sin vista previa y las cuentas de trabajo pueden quedar fuera de la revisión.")
            for (source in MessageSource.entries) {
                var enabled by remember(source) { mutableStateOf(source.enabled(context)) }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically) {
                    Text(source.label)
                    Switch(checked = enabled, onCheckedChange = {
                        source.setEnabled(context, it)
                        enabled = it
                    }, modifier = Modifier.semantics { contentDescription = "Avisos de ${source.label}" })
                }
                Text(when {
                    !enabled -> "Desactivado"
                    !connected -> "En espera de acceso a las notificaciones"
                    !allowedToNotify -> "En espera de permiso para mostrar avisos"
                    else -> "Revisando vistas previas disponibles"
                })
            }
            OutlinedButton(onClick = {
                settingsFailed = try {
                    context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
                    false
                } catch (_: ActivityNotFoundException) { true }
            }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                Text("Abrir acceso a notificaciones")
            }
            if (!allowedToNotify) {
                OutlinedButton(onClick = {
                    if (Build.VERSION.SDK_INT >= 33) requestNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
                    else context.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName))
                }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                    Text("Permitir avisos de Aquila Guard")
                }
                Text("Si ya rechazaste el permiso, abre Ajustes de Android y activa las notificaciones de Aquila Guard.")
            }
            if (settingsFailed) Text("Busca «Acceso a notificaciones» en Ajustes de Android.")
            Text("Puedes apagar cada fuente aquí y revocar el acceso en Ajustes. La revisión manual sigue disponible.")
        }
    }
}
