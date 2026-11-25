package cl.aquilaguard.preparation

import android.Manifest
import android.app.Activity
import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.net.VpnService
import android.os.Build
import android.provider.Settings
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.withResumed
import cl.aquilaguard.protection.DnsProtectionService
import cl.aquilaguard.notifications.DomainAlerts
import cl.aquilaguard.protection.DnsProtectionService.Phase
import kotlinx.coroutines.launch

@Composable
internal fun ProtectionPanel(status: DnsProtectionService.Status, diagnosticsContent: @Composable () -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var startAlerts by rememberSaveable { mutableStateOf(true) }
    var showDetails by rememberSaveable { mutableStateOf(false) }
    var message by rememberSaveable { mutableStateOf("") }
    var showNotificationSettings by rememberSaveable { mutableStateOf(false) }
    var loginNotices by rememberSaveable { mutableStateOf(DomainAlerts.loginNoticesEnabled(context)) }
    val stopped = status.phase == Phase.STOPPED
    val connectionReady = status.phase == Phase.OBSERVING || status.phase == Phase.CONNECTION_OK

    fun launchService() {
        val alerts = startAlerts
        lifecycleOwner.lifecycleScope.launch {
            lifecycleOwner.lifecycle.withResumed {
                if (alerts && !context.getSystemService(NotificationManager::class.java).areNotificationsEnabled()) {
                    message = "Permite las notificaciones para recibir avisos."
                    showNotificationSettings = true
                } else {
                    try {
                        DnsProtectionService.start(context, alerts = alerts, icon = R.drawable.ic_alert)
                    } catch (_: RuntimeException) {
                        message = "Android no pudo iniciar la VPN. Vuelve a tocar Activar avisos con Aquila Guard abierto."
                    }
                }
            }
        }
    }

    fun browserToOpen(address: String = "https://aquila-guard-a3ddd.web.app/"): Pair<String, Intent>? {
        val manager = context.packageManager
        val browsers = DnsProtectionService.supportedBrowsers
        val testPage = Intent(Intent.ACTION_VIEW, Uri.parse(address))
        val defaultBrowser = manager.resolveActivity(testPage, PackageManager.MATCH_DEFAULT_ONLY)?.activityInfo?.packageName
        val candidates = listOfNotNull(defaultBrowser?.takeIf { it in browsers }) + browsers.keys
        return candidates.firstNotNullOfOrNull { packageName ->
            val intent = Intent(testPage).setPackage(packageName)
            intent.resolveActivity(manager)?.let { browsers.getValue(packageName) to intent }
        }
    }

    fun openBrowserAlertTest(hostname: String) {
        val browser = browserToOpen("https://$hostname/")
        if (browser == null) {
            message = "Necesitas un navegador compatible para la prueba."
            return
        }
        if (!DnsProtectionService.armBrowserAlertTest(context, hostname)) {
            message = "No se pudo preparar la prueba. Comprueba que los avisos estén activos."
            return
        }
        try {
            context.startActivity(browser.second)
        } catch (_: ActivityNotFoundException) {
            DnsProtectionService.cancelBrowserAlertTest()
            message = "No se pudo abrir el navegador."
        }
    }

    val vpnConsent = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == Activity.RESULT_OK) launchService()
        else message = "Los avisos siguen apagados. Toca Activar avisos si quieres intentarlo otra vez."
    }

    fun requestVpn() {
        val connectivity = context.getSystemService(ConnectivityManager::class.java)
        val capabilities = connectivity.getNetworkCapabilities(connectivity.activeNetwork)
        if (capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) == true) {
            message = "Hay otra VPN encendida. Apágala para usar Aquila Guard."
            return
        }
        val permission = VpnService.prepare(context)
        if (permission == null) launchService() else vpnConsent.launch(permission)
    }

    val alertPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) requestVpn()
        else {
            message = "Los avisos siguen apagados. Puedes permitir las notificaciones en Ajustes."
            showNotificationSettings = true
        }
    }

    fun begin(alerts: Boolean) {
        message = ""
        showNotificationSettings = false
        startAlerts = alerts
        when {
            Build.VERSION.SDK_INT < 29 -> message = "Para usar los avisos necesitas Android 10 o posterior."
            browserToOpen() == null -> message = "Abre Aquila Guard con Chrome, Brave o Samsung Internet instalado y habilitado."
            alerts && Build.VERSION.SDK_INT >= 33 &&
                context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED ->
                alertPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            else -> requestVpn()
        }
    }

    val actionModifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)

    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
        Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            val title = when (status.phase) {
                Phase.STOPPED -> "Avisos apagados"
                Phase.CONNECTING -> "Preparando Aquila Guard…"
                Phase.CHECKING -> "Comprobando la conexión…"
                Phase.OBSERVING -> "Avisos activos"
                Phase.CONNECTION_OK -> "Prueba de conexión completada"
            }
            Text(
                title,
                Modifier.semantics { heading(); liveRegion = LiveRegionMode.Polite },
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold
            )
            val instruction = when (status.phase) {
                Phase.STOPPED -> "Recibe avisos de sitios sospechosos en Chrome, Brave o Samsung Internet."
                Phase.CONNECTING -> "Espera un momento mientras preparamos los avisos."
                Phase.CHECKING -> "Aquila Guard verifica la conexión automáticamente. Espera unos segundos."
                Phase.OBSERVING -> "Puedes seguir navegando en Chrome, Brave o Samsung Internet."
                Phase.CONNECTION_OK -> "Detén la prueba para activar los avisos."
            }
            Text(instruction, style = MaterialTheme.typography.bodyLarge)

            if (stopped) {
                Button(onClick = { begin(alerts = true) }, modifier = actionModifier) {
                    Text("Activar avisos", style = MaterialTheme.typography.titleMedium)
                }
                Text(
                    "Android puede pedirte permiso para mostrar avisos y usar una VPN local. Aquila Guard la usa para revisar los nombres de los sitios.",
                    style = MaterialTheme.typography.bodyMedium
                )
                if (status.message != "Vigilancia DNS apagada") {
                    Text(status.message, Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                }
            } else {
                if (connectionReady) {
                    val browser = browserToOpen()
                    if (browser != null) {
                        Button(onClick = {
                            try {
                                context.startActivity(browser.second)
                            } catch (_: ActivityNotFoundException) {
                                message = "Abre tu navegador desde la pantalla de inicio."
                            }
                        }, modifier = actionModifier) {
                            Text("Abrir ${browser.first}", style = MaterialTheme.typography.titleMedium)
                        }
                    }
                }
                OutlinedButton(onClick = {
                    try {
                        DnsProtectionService.stop(context)
                    } catch (_: RuntimeException) {
                        message = "Android rechazó la orden. Puedes detener la vigilancia desde la notificación."
                    }
                }, modifier = actionModifier) {
                    Text(if (status.phase == Phase.CONNECTION_OK) "Detener prueba" else "Detener vigilancia")
                }
            }

            if (message.isNotEmpty()) Text(message, Modifier.semantics { liveRegion = LiveRegionMode.Polite })
            if (status.notificationBlocked) Text("Se detectó un riesgo. Revisa los permisos de notificaciones para recibir el aviso.")
            if (showNotificationSettings || status.notificationBlocked) {
                TextButton(onClick = {
                    try {
                        context.startActivity(
                            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                        )
                    } catch (_: ActivityNotFoundException) {
                        message = "Abre Ajustes de Android → Aplicaciones → Aquila Guard → Notificaciones."
                    }
                }) { Text("Abrir ajustes de notificaciones") }
            }

            TextButton(onClick = { showDetails = !showDetails }) {
                Text(if (showDetails) "Ocultar detalles" else "Ver detalles y pruebas")
            }
            if (showDetails) {
                val version = context.packageManager.getPackageInfo(context.packageName, 0).versionName
                Text("Versión de Aquila Guard: ${version.orEmpty()}")
                Text("Consultas recibidas por la VPN: ${status.receivedQueries}")
                Text("Respuestas DNS utilizables: ${status.returnedAnswers}")
                Text("Avisos enviados a Android: ${status.postedNotifications}")
                Text("Recordatorios de inicio de sesión: ${status.loginNotifications}")
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 48.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Recordar antes de iniciar sesión", modifier = Modifier.weight(1f))
                    Switch(
                        checked = loginNotices,
                        onCheckedChange = {
                            DomainAlerts.setLoginNoticesEnabled(context, it)
                            loginNotices = it
                        },
                        modifier = Modifier.semantics { contentDescription = "Recordar antes de iniciar sesión" }
                    )
                }
                Text("Esta versión revisa los dominios que el navegador consulta por la VPN. El DNS seguro del navegador y la caché pueden dejar visitas fuera de cobertura.")
                if (stopped) OutlinedButton(onClick = { begin(alerts = false) }, modifier = actionModifier) {
                    Text("Solo comprobar conexión")
                }
                TextButton(onClick = {
                    val diagnostics = listOfNotNull(
                        "Aquila Guard ${version.orEmpty()} · Android ${Build.VERSION.RELEASE}",
                        "Estado: ${status.message}",
                        message.takeIf { it.isNotEmpty() }?.let { "Mensaje de activación: $it" },
                        "Prueba previa del DNS: ${status.upstreamDnsMillis?.let { "$it ms" } ?: "sin confirmar"}",
                        "DNS por la VPN: ${status.tunnelDnsMillis?.let { "$it ms" } ?: "sin confirmar"}",
                        "HTTPS con la VPN: ${status.httpsMillis?.let { "$it ms" } ?: "sin confirmar"}",
                        "Paquetes leídos por la VPN: ${status.receivedPackets}",
                        "Consultas recibidas por la VPN: ${status.receivedQueries}",
                        "Respuestas DNS: ${status.returnedAnswers}",
                        "Avisos enviados: ${status.postedNotifications}",
                        "Recordatorios de inicio de sesión enviados: ${status.loginNotifications}"
                    ).joinToString("\n")
                    context.getSystemService(ClipboardManager::class.java)
                        .setPrimaryClip(ClipData.newPlainText("Diagnóstico de Aquila Guard", diagnostics))
                    if (Build.VERSION.SDK_INT < 33) {
                        Toast.makeText(context, "Diagnóstico copiado.", Toast.LENGTH_SHORT).show()
                    }
                }) { Text("Copiar diagnóstico") }
                diagnosticsContent()
                if (status.phase == Phase.OBSERVING) {
                    Text("Prueba de sonido y vibración en el navegador", style = MaterialTheme.typography.titleMedium)
                    for (hostname in DnsProtectionService.browserTestHosts) {
                        OutlinedButton(onClick = { openBrowserAlertTest(hostname) }, modifier = actionModifier) {
                            Text("Probar con $hostname")
                        }
                    }
                    status.browserTestMessage?.let {
                        Text(it, Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                    }
                }
            }
        }
    }
    status.lastAlert?.let { AssessmentCard(it) }
}
