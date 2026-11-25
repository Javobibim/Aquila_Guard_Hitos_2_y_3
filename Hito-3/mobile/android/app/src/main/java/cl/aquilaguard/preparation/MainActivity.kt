package cl.aquilaguard.preparation

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cl.aquilaguard.core.DomainAssessment
import cl.aquilaguard.core.DomainRisk
import cl.aquilaguard.data.HistoryRetention
import cl.aquilaguard.data.ThreatHistory
import cl.aquilaguard.data.ThreatRepository
import cl.aquilaguard.detection.MessageEvaluator
import cl.aquilaguard.notifications.DomainAlerts
import cl.aquilaguard.notifications.HighRiskAlertSettings
import cl.aquilaguard.notifications.HighRiskTone
import cl.aquilaguard.notifications.TestAlert
import cl.aquilaguard.protection.DnsProtectionService
import java.text.DateFormat
import java.util.Date
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
    private var shared by mutableStateOf<SharedReview?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) readShare(intent)
        enableEdgeToEdge()
        setContent {
            MaterialTheme(colorScheme = AquilaColors) { AquilaScreen(shared) { shared = null } }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        readShare(intent)
    }

    private fun readShare(incoming: Intent) {
        if (incoming.action != Intent.ACTION_SEND || incoming.type != "text/plain") return
        val text = runCatching { incoming.getCharSequenceExtra(Intent.EXTRA_TEXT) }.getOrNull()
        shared = when {
            text.isNullOrBlank() -> SharedReview(null, "No recibimos texto. Comparte el contenido del mensaje o pégalo aquí.")
            text.length > 50_000 -> SharedReview(null, "El texto supera 50.000 caracteres. Comparte una parte del mensaje.")
            else -> SharedReview(text.toString(), "Texto recibido. Pulsa Revisar sin abrir para analizarlo en este dispositivo.")
        }
        setIntent(Intent(this, MainActivity::class.java))
    }
}

private class SharedReview(val text: String?, val notice: String)

private val AquilaColors = lightColorScheme(
    primary = Color(0xFF164874),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDCEAF7),
    onPrimaryContainer = Color(0xFF102C49),
    surface = Color(0xFFF5F8FC),
    onSurface = Color(0xFF172D45)
)

@Composable
private fun AquilaScreen(shared: SharedReview?, onShareHandled: () -> Unit) {
    val context = LocalContext.current
    val application = context.applicationContext
    val history = remember(application) { ThreatHistory(application) }
    val protectionStatus by DnsProtectionService.status.collectAsStateWithLifecycle()
    var retention by remember { mutableStateOf(history.retention) }
    var records by remember { mutableStateOf(history.entries()) }
    var tab by remember { mutableIntStateOf(0) }
    var dataset by remember { mutableStateOf<ThreatRepository.Loaded?>(null) }
    var datasetFailed by remember { mutableStateOf(false) }
    var linkInput by remember { mutableStateOf("") }
    var messageInput by remember { mutableStateOf("") }
    var reviewMessage by rememberSaveable { mutableStateOf(false) }
    val input = if (reviewMessage) messageInput else linkInput
    var results by remember { mutableStateOf(emptyList<DomainAssessment>()) }
    var messageReview by remember { mutableStateOf<MessageEvaluator.Review?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var notificationStatus by remember { mutableStateOf("") }
    var highRiskTest by rememberSaveable { mutableStateOf(false) }
    var shareNotice by remember { mutableStateOf("") }
    val scroll = rememberScrollState()

    LaunchedEffect(shared) {
        if (shared != null) {
            tab = 0
            reviewMessage = true
            shared.text?.let { messageInput = it }
            results = emptyList()
            messageReview = null
            error = null
            shareNotice = shared.notice
            scroll.scrollTo(0)
            onShareHandled()
        }
    }

    LaunchedEffect(protectionStatus.lastAlert) {
        if (protectionStatus.lastAlert != null) records = history.entries()
    }

    LaunchedEffect(application) {
        try {
            dataset = withContext(Dispatchers.IO) { ThreatRepository.load(application) }
        } catch (error: kotlinx.coroutines.CancellationException) {
            throw error
        } catch (_: Exception) {
            datasetFailed = true
        }
    }

    fun postTestAlert() {
        val posted = if (highRiskTest) {
            val sample = DomainAssessment("prueba.example", DomainRisk.REPORTED, listOf("Esta es una simulación del aviso."))
            DomainAlerts.post(context, sample, R.drawable.ic_alert, open = null, demo = true)
        } else TestAlert.post(context, R.drawable.ic_alert)
        notificationStatus = if (posted) {
            "Notificación de prueba enviada."
        } else {
            "Las notificaciones están desactivadas. Puedes habilitarlas en Ajustes de Android."
        }
    }

    val requestNotifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) postTestAlert() else notificationStatus = "Permiso no concedido. La revisión manual sigue disponible."
    }

    fun testNotification(highRisk: Boolean) {
        highRiskTest = highRisk
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            postTestAlert()
        }
    }

    Scaffold { insets ->
        Column(
            Modifier.fillMaxSize().padding(insets).imePadding(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Row(
                Modifier.widthIn(max = 680.dp).fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Image(painterResource(R.drawable.aquila_logo), null, Modifier.size(48.dp))
                Column {
                    Text("Aquila Guard", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Text("Revisión de enlaces y mensajes", style = MaterialTheme.typography.bodyLarge)
                }
            }

            PrimaryTabRow(selectedTabIndex = tab, modifier = Modifier.widthIn(max = 680.dp)) {
                Tab(tab == 0, { tab = 0 }, text = { Text("Inicio") })
                Tab(tab == 1, { records = history.entries(); tab = 1 }, text = { Text("Historial") })
            }

            Column(
                Modifier.widthIn(max = 680.dp).fillMaxSize().verticalScroll(scroll).padding(horizontal = 20.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                if (tab == 0) {
                    Text("Revisión manual", style = MaterialTheme.typography.titleLarge)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        for (messageMode in listOf(false, true)) {
                            FilterChip(
                                selected = reviewMessage == messageMode,
                                onClick = {
                                    if (reviewMessage != messageMode) {
                                        reviewMessage = messageMode
                                        results = emptyList()
                                        messageReview = null
                                        error = null
                                    }
                                },
                                label = { Text(if (messageMode) "Correo o mensaje" else "Enlace") }
                            )
                        }
                    }
                    val loaded = dataset
                    when {
                        loaded != null -> Text(
                            if (reviewMessage) "Pega el texto para revisar solicitudes sospechosas y hasta 30 dominios visibles sin abrir los enlaces."
                            else "Pega el enlace para revisar el sitio sin abrirlo.",
                            style = MaterialTheme.typography.bodyLarge
                        )
                        datasetFailed -> Text("No se pudo cargar la lista local. Revisión no disponible.", color = MaterialTheme.colorScheme.error)
                        else -> Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                            Text("Cargando la lista local…")
                        }
                    }
                    OutlinedTextField(
                        value = input,
                        onValueChange = {
                            val limit = if (reviewMessage) 50_000 else 8_192
                            if (it.length > limit) {
                                error = "El contenido supera el límite. Pega una parte más corta."
                                return@OutlinedTextField
                            }
                            if (reviewMessage) messageInput = it else linkInput = it
                            shareNotice = ""
                            results = emptyList()
                            messageReview = null
                            error = null
                        },
                        label = { Text(if (reviewMessage) "Texto del correo o mensaje" else "Enlace o dominio") },
                        placeholder = { Text(if (reviewMessage) "Pega el texto aquí" else "ejemplo.cl") },
                        singleLine = !reviewMessage,
                        minLines = if (reviewMessage) 4 else 1,
                        maxLines = if (reviewMessage) 8 else 1,
                        keyboardOptions = KeyboardOptions(keyboardType = if (reviewMessage) KeyboardType.Text else KeyboardType.Uri),
                        modifier = Modifier.fillMaxWidth()
                    )
                    if (reviewMessage && shareNotice.isNotEmpty()) {
                        Text(shareNotice, Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                    }
                    Button(
                        onClick = {
                            shareNotice = ""
                            try {
                                val evaluator = checkNotNull(loaded).evaluator
                                messageReview = if (reviewMessage) MessageEvaluator(evaluator).review(input) else null
                                val review = messageReview?.links
                                val assessments = review?.assessments ?: listOf(evaluator.evaluate(input.trim()))
                                results = assessments
                                error = when {
                                    review?.truncated == true -> "La revisión se limitó a las primeras 30 direcciones. Pega el resto por separado."
                                    assessments.isEmpty() && messageReview?.risk == DomainRisk.NO_MATCH ->
                                        "No encontré enlaces analizables. Si el correo tiene un botón, copia su dirección y pégala en Enlace."
                                    else -> null
                                }
                                assessments.forEach(history::record)
                                records = history.entries()
                            } catch (invalid: IllegalArgumentException) {
                                results = emptyList()
                                messageReview = null
                                error = invalid.message ?: "No se pudo interpretar la dirección."
                            }
                        },
                        enabled = loaded != null && input.isNotBlank(),
                        modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)
                    ) { Text("Revisar sin abrir") }
                    if (input.isNotEmpty() || shareNotice.isNotEmpty() || error != null) {
                        OutlinedButton(
                            onClick = {
                                linkInput = ""
                                messageInput = ""
                                results = emptyList()
                                messageReview = null
                                error = null
                                shareNotice = ""
                            },
                            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
                        ) { Text("Limpiar revisión") }
                    }

                    error?.let { Text(it, Modifier.semantics { liveRegion = LiveRegionMode.Polite }, color = MaterialTheme.colorScheme.error) }
                    messageReview?.takeIf { it.risk != DomainRisk.NO_MATCH }?.let { review ->
                        Card(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(riskLabel(review.risk), style = MaterialTheme.typography.titleMedium)
                                review.reasons.forEach { Text(it) }
                                Text("Comprueba la solicitud por un canal oficial antes de responder o abrir enlaces.")
                            }
                        }
                    }
                    results.forEach { AssessmentCard(it) }

                    ProtectionPanel(protectionStatus) {
                        dataset?.let { Text("${it.count} dominios en la copia local · ${it.fetchedAt.take(10)}") }
                        OutlinedButton(onClick = { testNotification(false) },
                            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Enviar notificación simulada") }
                        HighRiskAlertControls(onPreview = { testNotification(true) })
                        if (notificationStatus.isNotEmpty()) {
                            Text(notificationStatus, Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                        }
                    }

                    MessageAlertsPanel()
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Directorio privado de teléfonos", style = MaterialTheme.typography.titleLarge)
                            Text("Consulta coincidencias o reporta un número sospechoso. Usa tu cuenta de Aquila Guard con correo verificado.")
                            Button(onClick = { context.startActivity(Intent(context, PhoneDirectoryActivity::class.java)) },
                                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                                Text("Consultar o reportar un teléfono")
                            }
                        }
                    }
                } else {
                    Text("Historial local", style = MaterialTheme.typography.titleLarge)
                    Text("Cuando lo activas, guarda el dominio y la fecha de los hallazgos manuales y automáticos.")
                    for (option in HistoryRetention.entries) {
                        FilterChip(
                            selected = option == retention,
                            onClick = {
                                history.setRetention(option)
                                retention = option
                                records = history.entries()
                            },
                            label = { Text(if (option == HistoryRetention.OFF) "Desactivado" else "${option.days} días") }
                        )
                    }
                    OutlinedButton(onClick = { history.clear(); records = emptyList() }, enabled = records.isNotEmpty()) {
                        Text("Borrar historial")
                    }
                    if (records.isEmpty()) Text("No hay alertas guardadas.")
                    for (record in records) {
                        Text(record.hostname, fontWeight = FontWeight.Bold)
                        Text("${riskLabel(record.risk)} · ${DateFormat.getDateTimeInstance().format(Date(record.recordedAtMillis))}")
                        HorizontalDivider()
                    }
                }
            }
        }
    }
}

@Composable
private fun HighRiskAlertControls(onPreview: () -> Unit) {
    val context = LocalContext.current
    var settings by remember(context) { mutableStateOf(HighRiskAlertSettings.load(context)) }
    var showTones by remember { mutableStateOf(false) }

    fun save(updated: HighRiskAlertSettings) {
        updated.save(context)
        settings = updated
    }

    Row(
        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text("Sonido de los avisos", modifier = Modifier.weight(1f))
        Switch(
            checked = settings.soundEnabled,
            onCheckedChange = { save(settings.copy(soundEnabled = it)) },
            modifier = Modifier.semantics { contentDescription = "Sonido de los avisos" }
        )
    }
    Text("Avisos de riesgo alto", style = MaterialTheme.typography.titleMedium)
    Box(Modifier.fillMaxWidth()) {
        OutlinedButton(
            onClick = { showTones = true },
            enabled = settings.soundEnabled,
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
        ) { Text("Sonido · ${settings.tone.label}") }
        DropdownMenu(expanded = showTones, onDismissRequest = { showTones = false }) {
            for (tone in HighRiskTone.entries) {
                DropdownMenuItem(
                    text = { Text(tone.label) },
                    onClick = {
                        save(settings.copy(tone = tone))
                        showTones = false
                    }
                )
            }
        }
    }
    Row(
        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text("Vibración corta", modifier = Modifier.weight(1f))
        Switch(
            checked = settings.vibrate,
            onCheckedChange = { save(settings.copy(vibrate = it)) },
            modifier = Modifier.semantics { contentDescription = "Vibración corta para riesgo alto" }
        )
    }
    OutlinedButton(
        onClick = onPreview,
        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
    ) { Text("Probar alerta de riesgo alto") }
}

@Composable
internal fun AssessmentCard(assessment: DomainAssessment) {
    Card(Modifier.semantics { liveRegion = LiveRegionMode.Polite }) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Text(riskLabel(assessment.risk), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(assessment.hostname)
            for (reason in assessment.reasons) Text(reason, style = MaterialTheme.typography.bodyLarge)
            Text("La revisión se limita al dominio. La ausencia de señales no garantiza seguridad.")
        }
    }
}

private fun riskLabel(risk: DomainRisk): String = when (risk) {
    DomainRisk.REPORTED -> "Riesgo alto · Dominio reportado"
    DomainRisk.SIGNALS -> "Riesgo moderado · Posible suplantación"
    DomainRisk.NO_MATCH -> "Sin coincidencias en la revisión"
}
