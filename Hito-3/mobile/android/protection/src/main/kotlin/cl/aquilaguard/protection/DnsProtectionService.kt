package cl.aquilaguard.protection

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.DnsResolver
import android.net.LinkProperties
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.VpnService
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.system.OsConstants
import androidx.annotation.MainThread
import androidx.annotation.RequiresApi
import cl.aquilaguard.core.DomainAssessment
import cl.aquilaguard.core.DomainRisk
import cl.aquilaguard.data.ThreatHistory
import cl.aquilaguard.data.ThreatRepository
import cl.aquilaguard.notifications.DomainAlerts
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.URL
import java.util.concurrent.atomic.AtomicInteger
import javax.net.ssl.HttpsURLConnection
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

class DnsProtectionService : VpnService() {
    enum class Phase { STOPPED, CONNECTING, CHECKING, OBSERVING, CONNECTION_OK }

    data class Status(
        val phase: Phase = Phase.STOPPED,
        val message: String = "Vigilancia DNS apagada",
        val lastAlert: DomainAssessment? = null,
        val receivedPackets: Int = 0,
        val receivedQueries: Int = 0,
        val returnedAnswers: Int = 0,
        val postedNotifications: Int = 0,
        val loginNotifications: Int = 0,
        val browserTestMessage: String? = null,
        val notificationBlocked: Boolean = false,
        val upstreamDnsMillis: Long? = null,
        val tunnelDnsMillis: Long? = null,
        val httpsMillis: Long? = null
    )

    private class Session(val alerts: Boolean, val icon: Int) {
        val limiter = AlertLimiter()
        val receivedPackets = AtomicInteger()
        val receivedQueries = AtomicInteger()
        val vpnNetwork = CompletableDeferred<Network>()
        val relayedProbe = CompletableDeferred<Unit>()
        var job: Job? = null
        var browserTestJob: Job? = null
        var tunnel: DnsTunnel? = null
        val networkCallbacks = mutableListOf<ConnectivityManager.NetworkCallback>()
        var deadline: Runnable? = null
        var consecutiveDnsErrors = 0
    }

    private val main = Handler(Looper.getMainLooper())
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val connectivity by lazy { getSystemService(ConnectivityManager::class.java) }
    private val notificationManager by lazy { getSystemService(NotificationManager::class.java) }
    private var session: Session? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == RUN_BROWSER_TEST) {
            val current = session
            if (current == null) stopSelf(startId)
            else intent.getStringExtra(BROWSER_TEST_HOST)?.let { runBrowserAlertTest(current, it) }
            return START_NOT_STICKY
        }
        if (intent?.action == DISMISS_LOGIN) {
            DomainAlerts.dismissLoginNotice(this)
            if (session == null) stopSelf(startId)
            return START_NOT_STICKY
        }
        if (intent?.action != START) {
            finish("Vigilancia DNS apagada")
            return START_NOT_STICKY
        }
        if (session != null) return START_NOT_STICKY
        if (Build.VERSION.SDK_INT < 29 || prepare(this) != null) {
            finish("Se requiere Android 10 o posterior y autorización de VPN.")
            return START_NOT_STICKY
        }

        val current = Session(intent.getBooleanExtra(ALERTS, false), intent.getIntExtra(ICON, android.R.drawable.ic_dialog_alert))
        session = current
        val message = "Preparando la vigilancia DNS…"
        mutableStatus.value = Status(Phase.CONNECTING, message)
        try {
            notificationManager.createNotificationChannel(NotificationChannel(CHANNEL, "Vigilancia DNS", NotificationManager.IMPORTANCE_LOW))
            DomainAlerts.createChannels(this)
            notificationManager.cancel(INTERRUPTED_NOTIFICATION)
            val notification = ongoing(current, message)
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(STATUS_NOTIFICATION, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SYSTEM_EXEMPTED)
            } else {
                startForeground(STATUS_NOTIFICATION, notification)
            }
        } catch (_: RuntimeException) {
            finish("Android no permitió iniciar el servicio de VPN.")
            return START_NOT_STICKY
        }
        current.job = scope.launch { monitor(current) }
        return START_NOT_STICKY
    }

    @RequiresApi(29)
    private suspend fun monitor(current: Session) {
        try {
            val evaluator = if (current.alerts) {
                withContext(Dispatchers.IO) { ThreatRepository.load(applicationContext).evaluator }
            } else null
            val history = ThreatHistory(applicationContext)
            val network = checkNotNull(connectivity.activeNetwork) { "Conéctate a internet antes de iniciar." }
            val capabilities = checkNotNull(connectivity.getNetworkCapabilities(network)) { "La red dejó de estar disponible." }
            check(capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)) { "Detén la otra VPN antes de iniciar." }
            check(!capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_CAPTIVE_PORTAL)) {
                "La red Wi-Fi requiere iniciar sesión. Abre el navegador, completa el acceso a la red y vuelve a activar los avisos."
            }
            val properties = checkNotNull(connectivity.getLinkProperties(network)) { "No se pudo identificar el DNS de la red." }
            check(properties.dnsServers.isNotEmpty()) { "La red no tiene un DNS disponible." }
            check(properties.privateDnsServerName == null) { "DNS privado estricto está activo. Se respetó tu configuración y la VPN no se inició." }

            val builder = Builder()
                .setSession("Aquila Guard · DNS")
                .setMtu(DnsPacket.MTU)
                .setBlocking(false)
                .setMetered(false)
                .setUnderlyingNetworks(arrayOf(network))
                .addAddress(DnsPacket.LOCAL_V4, 32)
                .addRoute(DnsPacket.DNS_V4, 32)
                .addDnsServer(DnsPacket.DNS_V4)
                // DNS record type is independent of the transport's address family.
                .allowFamily(OsConstants.AF_INET6)

            val browsers = supportedBrowsers.keys.filter { browser ->
                try {
                    builder.addAllowedApplication(browser)
                    true
                } catch (_: PackageManager.NameNotFoundException) {
                    false
                }
            }
            check(browsers.isNotEmpty()) { "Instala Chrome, Brave o el navegador Samsung para activar los avisos." }
            builder.addAllowedApplication(packageName)
            observeNetwork(current, network)
            val resolver = PlatformDns(network)
            val probeStarted = SystemClock.elapsedRealtime()
            val probeOk = try {
                withContext(Dispatchers.IO) {
                    withTimeoutOrNull(2500) { resolver.checkConnection() } == true
                }
            } catch (_: DnsResolver.DnsException) {
                false
            }
            check(probeOk) { "El DNS de esta red no respondió a la comprobación. La VPN quedó apagada." }
            mutableStatus.value = status.value.copy(upstreamDnsMillis = SystemClock.elapsedRealtime() - probeStarted)
            val descriptor = checkNotNull(builder.establish()) { "Android no pudo crear la interfaz VPN." }
            val tunnel = DnsTunnel(
                descriptor, resolver::query,
                onPacket = { current.receivedPackets.incrementAndGet() },
                onQuery = { current.receivedQueries.incrementAndGet() }
            ) { name ->
                if (name == PlatformDns.PROBE_DOMAIN) current.relayedProbe.complete(Unit)
                val assessment = if (name != null && evaluator != null) {
                    try { evaluator.evaluate(name) } catch (_: IllegalArgumentException) { null }
                } else null
                withContext(Dispatchers.Main.immediate) {
                    if (session === current) {
                        if (name == null) {
                            if (++current.consecutiveDnsErrors >= 3) {
                                finish("El DNS rechazó varias consultas seguidas. Se retiró la ruta VPN.", interrupted = true)
                            }
                        } else {
                            current.consecutiveDnsErrors = 0
                            handleAnswer(current, assessment, history)
                        }
                    }
                }
            }
            current.tunnel = tunnel
            update(current, Phase.CHECKING, "Comprobando DNS y conexión HTTPS…")
            current.deadline = Runnable {
                if (session === current && status.value.phase == Phase.CHECKING) {
                    val reason = when {
                        !current.vpnNetwork.isCompleted -> "Android no asignó la red VPN."
                        current.receivedPackets.get() == 0 -> "La VPN no recibió paquetes durante la prueba."
                        current.receivedQueries.get() == 0 -> "La VPN recibió tráfico, pero ninguna consulta DNS compatible."
                        status.value.tunnelDnsMillis == null -> "Android no confirmó la respuesta DNS a través de la VPN."
                        else -> "La página HTTPS de prueba no respondió a tiempo."
                    }
                    finish("$reason Se retiró la ruta VPN.", interrupted = true)
                }
            }.also { main.postDelayed(it, 7000) }

            coroutineScope {
                val relay = launch(Dispatchers.IO) { tunnel.run() }
                val vpn = current.vpnNetwork.await()
                val dnsStarted = SystemClock.elapsedRealtime()
                if (!withContext(Dispatchers.IO) { PlatformDns(vpn).checkConnection() }) {
                    throw ProbeFailure("Android no recibió una dirección DNS utilizable a través de la VPN.")
                }
                current.relayedProbe.await()
                mutableStatus.value = status.value.copy(tunnelDnsMillis = SystemClock.elapsedRealtime() - dnsStarted)
                val httpsStarted = SystemClock.elapsedRealtime()
                if (!withContext(Dispatchers.IO) { checkHttps(vpn) }) {
                    throw ProbeFailure("El DNS respondió, pero la página HTTPS de prueba no cargó con la VPN.")
                }
                mutableStatus.value = status.value.copy(httpsMillis = SystemClock.elapsedRealtime() - httpsStarted)
                current.deadline?.let(main::removeCallbacks)
                val phase = if (current.alerts) Phase.OBSERVING else Phase.CONNECTION_OK
                val message = if (current.alerts) "Vigilando dominios DNS visibles" else "DNS y HTTPS comprobados · avisos apagados"
                update(current, phase, message)
                relay.join()
            }
            if (session === current) finish("La interfaz DNS se cerró.", interrupted = true)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            if (session === current) {
                val message = when {
                    current.tunnel == null && failure is IllegalStateException -> failure.message
                    failure is ProbeFailure -> failure.message + " Se retiró la ruta VPN."
                    failure is DnsResolver.DnsException && status.value.phase == Phase.CHECKING ->
                        "Android devolvió un error al resolver por la VPN. Se retiró la ruta VPN."
                    failure is DnsTransportException -> failure.message + " Se retiró la ruta VPN."
                    failure is SocketTimeoutException -> "El resolutor no respondió a tiempo. Se retiró la ruta VPN."
                    else -> "Se detuvo la vigilancia por un problema de DNS o conexión. Se retiró la ruta VPN."
                }
                finish(message ?: "No se pudo iniciar la vigilancia DNS.", interrupted = true)
            }
        }
    }

    private class ProbeFailure(message: String) : Exception(message)

    private fun checkHttps(network: Network): Boolean {
        val connection = try {
            network.openConnection(URL("https://${PlatformDns.PROBE_DOMAIN}/")) as HttpsURLConnection
        } catch (_: IOException) {
            return false
        }
        return try {
            connection.requestMethod = "HEAD"
            connection.instanceFollowRedirects = false
            connection.useCaches = false
            connection.connectTimeout = 2500
            connection.readTimeout = 2500
            connection.responseCode in 200..299
        } catch (_: IOException) {
            false
        } finally {
            connection.disconnect()
        }
    }

    private fun handleAnswer(current: Session, assessment: DomainAssessment?, history: ThreatHistory) {
        var next = status.value.copy(
            receivedPackets = current.receivedPackets.get(),
            receivedQueries = current.receivedQueries.get(),
            returnedAnswers = status.value.returnedAnswers + 1
        )
        if (assessment != null) {
            val now = SystemClock.elapsedRealtime()
            if (assessment.risk != DomainRisk.NO_MATCH) {
                if (current.limiter.allow(assessment, now)) {
                    history.record(assessment)
                    val posted = DomainAlerts.post(this, assessment, current.icon, openApp())
                    next = next.copy(
                        lastAlert = assessment,
                        postedNotifications = next.postedNotifications + if (posted) 1 else 0,
                        notificationBlocked = !posted
                    )
                }
            } else if (browserAlertTest.consume(assessment.hostname, now)) {
                val sample = DomainAssessment(
                    assessment.hostname,
                    DomainRisk.REPORTED,
                    listOf("Aquila Guard recibió una consulta DNS de la página de demostración.")
                )
                val posted = DomainAlerts.post(this, sample, current.icon, openApp(), demo = true)
                next = next.copy(browserTestMessage = if (posted) {
                    "Prueba completada. Se envió la notificación simulada."
                } else {
                    "La VPN recibió la consulta. Android bloqueó la notificación de prueba."
                })
            } else if (LoginDomains.matches(assessment.hostname) && DomainAlerts.loginNoticesEnabled(this) &&
                current.limiter.allowLoginNotice(assessment.hostname, now) &&
                DomainAlerts.postLoginNotice(this, assessment.hostname, current.icon, dismissLoginIntent())
            ) {
                next = next.copy(loginNotifications = next.loginNotifications + 1)
            }
        }
        mutableStatus.value = next
    }

    private fun runBrowserAlertTest(current: Session, hostname: String) {
        if (Build.VERSION.SDK_INT < 29 || status.value.phase != Phase.OBSERVING) return
        current.browserTestJob?.cancel()
        current.browserTestJob = scope.launch {
            delay(900)
            if (!browserAlertTest.isPending(hostname, SystemClock.elapsedRealtime())) return@launch
            val vpn = current.vpnNetwork.await()
            try {
                withContext(Dispatchers.IO) {
                    withTimeoutOrNull(3500) { PlatformDns(vpn).checkConnection(hostname) }
                }
            } catch (_: DnsResolver.DnsException) {
                // The result below comes from the relay, even when the system resolver reports an error.
            }
            delay(250)
            if (session === current && browserAlertTest.isPending(hostname, SystemClock.elapsedRealtime())) {
                browserAlertTest.clear()
                mutableStatus.value = status.value.copy(
                    browserTestMessage = "La VPN no observó la consulta de prueba. Puedes comprobar el sonido y la vibración dentro de la app."
                )
            }
        }
    }

    private fun dismissLoginIntent(): PendingIntent = PendingIntent.getService(
        this,
        2,
        Intent(this, DnsProtectionService::class.java).setAction(DISMISS_LOGIN),
        PendingIntent.FLAG_IMMUTABLE
    )

    private fun observeNetwork(current: Session, network: Network) {
        val underlay = UnderlayWatch(network)
        val physical = object : ConnectivityManager.NetworkCallback() {
            override fun onLost(lost: Network) {
                underlay.lost(lost)?.let { networkChanged(current, it) }
            }

            override fun onCapabilitiesChanged(changed: Network, capabilities: NetworkCapabilities) {
                underlay.captivePortal(changed, capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_CAPTIVE_PORTAL))
                    ?.let { networkChanged(current, it) }
            }

            override fun onLinkPropertiesChanged(changed: Network, properties: LinkProperties) {
                underlay.dns(changed, properties.dnsServers.isNotEmpty(), properties.privateDnsServerName != null)
                    ?.let { networkChanged(current, it) }
            }
        }
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .addCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)
            .build()
        connectivity.registerNetworkCallback(request, physical, main)
        current.networkCallbacks += physical

        val defaultNetwork = object : ConnectivityManager.NetworkCallback() {
            private var vpnCandidate: Network? = null

            override fun onCapabilitiesChanged(changed: Network, capabilities: NetworkCapabilities) {
                if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) vpnCandidate = changed
                underlay.defaultChanged(changed, capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN))
                    ?.let { networkChanged(current, it) }
            }

            override fun onLinkPropertiesChanged(changed: Network, properties: LinkProperties) {
                if (session === current && changed == vpnCandidate &&
                    properties.dnsServers.any { it.hostAddress == DnsPacket.DNS_V4 }) {
                    current.vpnNetwork.complete(changed)
                }
            }
        }
        connectivity.registerDefaultNetworkCallback(defaultNetwork, main)
        current.networkCallbacks += defaultNetwork
    }

    private fun networkChanged(current: Session, reason: UnderlayFailure) {
        if (session !== current) return
        val message = when (reason) {
            UnderlayFailure.SWITCHED -> "Cambió la conexión de Wi-Fi o datos."
            UnderlayFailure.LOST -> "La red dejó de tener acceso a internet."
            UnderlayFailure.CAPTIVE_PORTAL -> "La red Wi-Fi requiere iniciar sesión en el navegador."
            UnderlayFailure.NO_DNS -> "La red ya no ofrece un resolutor DNS."
            UnderlayFailure.STRICT_DNS -> "La red usa DNS privado con un proveedor personalizado."
        }
        finish("$message Se detuvo la VPN.", interrupted = true)
    }

    private fun update(current: Session, phase: Phase, message: String) {
        mutableStatus.value = status.value.copy(phase = phase, message = message)
        try {
            notificationManager.notify(STATUS_NOTIFICATION, ongoing(current, message))
        } catch (_: SecurityException) {
            // The foreground service can still run when its notification is hidden.
        }
    }

    private fun ongoing(current: Session, message: String): Notification {
        val stop = PendingIntent.getService(
            this, 1, stopIntent(this), PendingIntent.FLAG_IMMUTABLE
        )
        return Notification.Builder(this, CHANNEL)
            .setSmallIcon(current.icon)
            .setContentTitle("Aquila Guard · DNS")
            .setContentText(message)
            .setContentIntent(openApp())
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .addAction(Notification.Action.Builder(null, "Detener", stop).build())
            .build()
    }

    private fun openApp(): PendingIntent? {
        val intent = packageManager.getLaunchIntentForPackage(packageName) ?: return null
        return PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE)
    }

    private fun releaseSession() {
        val current = session ?: return
        session = null
        mutableStatus.value = status.value.copy(
            receivedPackets = current.receivedPackets.get(),
            receivedQueries = current.receivedQueries.get()
        )
        current.deadline?.let(main::removeCallbacks)
        for (callback in current.networkCallbacks) runCatching { connectivity.unregisterNetworkCallback(callback) }
        current.job?.cancel()
        current.browserTestJob?.cancel()
        runCatching { current.tunnel?.close() }
        browserAlertTest.clear()
        DomainAlerts.dismissLoginNotice(this)
    }

    private fun finish(message: String, interrupted: Boolean = false) {
        val interruptionIcon = if (interrupted && session?.alerts == true) session?.icon else null
        releaseSession()
        publishStopped(message)
        stopForeground(STOP_FOREGROUND_REMOVE)
        if (interruptionIcon != null) {
            val notification = Notification.Builder(this, CHANNEL)
                .setSmallIcon(interruptionIcon)
                .setContentTitle("Aquila Guard · Vigilancia detenida")
                .setContentText(message)
                .setStyle(Notification.BigTextStyle().bigText(message))
                .setContentIntent(openApp())
                .setAutoCancel(true)
                .build()
            try {
                notificationManager.notify(INTERRUPTED_NOTIFICATION, notification)
            } catch (_: SecurityException) {
                // The system may have revoked notification permission.
            }
        }
        stopSelf()
    }

    override fun onRevoke() {
        main.post { finish("Android retiró el permiso de VPN.") }
    }

    override fun onDestroy() {
        if (session != null) {
            releaseSession()
            publishStopped("Vigilancia DNS apagada")
        }
        scope.cancel()
        super.onDestroy()
    }

    private fun publishStopped(message: String) {
        mutableStatus.value = status.value.copy(
            phase = Phase.STOPPED, message = message, lastAlert = null, notificationBlocked = false
        )
    }

    companion object {
        private const val START = "cl.aquilaguard.START_DNS"
        private const val STOP = "cl.aquilaguard.STOP_DNS"
        private const val DISMISS_LOGIN = "cl.aquilaguard.DISMISS_LOGIN"
        private const val RUN_BROWSER_TEST = "cl.aquilaguard.RUN_BROWSER_TEST"
        private const val BROWSER_TEST_HOST = "browser_test_host"
        private const val ICON = "notification_icon"
        private const val ALERTS = "notify_about_domains"
        private const val CHANNEL = "dns_monitor_status"
        private const val STATUS_NOTIFICATION = 19
        private const val INTERRUPTED_NOTIFICATION = 22
        val supportedBrowsers = mapOf(
            "com.android.chrome" to "Chrome",
            "com.brave.browser" to "Brave",
            "com.sec.android.app.sbrowser" to "Samsung Internet"
        )

        private val mutableStatus = MutableStateFlow(Status())
        val status = mutableStatus.asStateFlow()
        private val browserAlertTest = BrowserAlertTest()
        val browserTestHosts = BrowserAlertTest.hosts

        @MainThread
        fun armBrowserAlertTest(context: Context, hostname: String): Boolean {
            if (status.value.phase != Phase.OBSERVING ||
                !browserAlertTest.arm(hostname, SystemClock.elapsedRealtime())) return false
            mutableStatus.value = status.value.copy(
                browserTestMessage = "Comprobando $hostname a través de la VPN…"
            )
            try {
                context.startService(
                    Intent(context, DnsProtectionService::class.java).setAction(RUN_BROWSER_TEST)
                        .putExtra(BROWSER_TEST_HOST, hostname)
                )
            } catch (_: RuntimeException) {
                cancelBrowserAlertTest()
                return false
            }
            return true
        }

        @MainThread
        fun cancelBrowserAlertTest() {
            browserAlertTest.clear()
            mutableStatus.value = status.value.copy(browserTestMessage = null)
        }

        fun start(context: Context, alerts: Boolean, icon: Int) {
            context.startForegroundService(
                Intent(context, DnsProtectionService::class.java).setAction(START).putExtra(ALERTS, alerts).putExtra(ICON, icon)
            )
        }

        private fun stopIntent(context: Context) =
            Intent(context, DnsProtectionService::class.java).setAction(STOP)

        fun stop(context: Context) {
            context.startService(stopIntent(context))
        }
    }
}
