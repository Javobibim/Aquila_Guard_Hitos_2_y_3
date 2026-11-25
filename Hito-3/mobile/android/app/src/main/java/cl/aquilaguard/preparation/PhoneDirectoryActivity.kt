package cl.aquilaguard.preparation

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView

class PhoneDirectoryActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val browser = remember { runCatching { WebView(this) }.getOrNull() }
            var loading by remember { mutableStateOf(browser != null) }
            var loadFailed by remember { mutableStateOf(browser == null) }
            var fallbackFailed by remember { mutableStateOf(false) }
            BackHandler { if (browser?.canGoBack() == true) browser.goBack() else finish() }
            MaterialTheme {
                Scaffold { padding ->
                    Column(Modifier.fillMaxSize().padding(padding)) {
                        Row(Modifier.fillMaxWidth().padding(12.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            OutlinedButton(onClick = { finish() }) { Text("Volver") }
                            Text("Directorio de teléfonos", style = MaterialTheme.typography.titleMedium)
                        }
                        if (loading) LinearProgressIndicator(Modifier.fillMaxWidth())
                        if (loadFailed) {
                            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text("No pudimos abrir el directorio. Comprueba tu conexión y vuelve a intentarlo.")
                                if (browser != null) OutlinedButton(onClick = {
                                    loadFailed = false
                                    loading = true
                                    browser.loadUrl(DIRECTORY)
                                }) { Text("Reintentar") }
                                OutlinedButton(onClick = {
                                    fallbackFailed = try {
                                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(DIRECTORY)))
                                        false
                                    } catch (_: ActivityNotFoundException) { true }
                                }) { Text("Abrir en mi navegador") }
                                if (fallbackFailed) Text("El dispositivo no tiene un navegador disponible.")
                            }
                        }
                        if (browser != null) AndroidView(
                            factory = {
                                browser.configure(
                                    onLoading = { loading = true; loadFailed = false },
                                    onComplete = { loading = false },
                                    onFailure = { loading = false; loadFailed = true },
                                )
                                browser.loadUrl(DIRECTORY)
                                browser
                            },
                            modifier = Modifier.weight(1f).fillMaxWidth(),
                            onRelease = { view ->
                                view.stopLoading()
                                view.destroy()
                            },
                        )
                    }
                }
            }
        }
    }

    private companion object {
        const val HOST = "aquila-guard-a3ddd.web.app"
        const val DIRECTORY = "https://$HOST/?modo=telefono#revisar"

        fun trusted(uri: Uri): Boolean = uri.scheme == "https" && uri.host == HOST &&
            uri.userInfo == null && uri.port in listOf(-1, 443)

        @Suppress("SetJavaScriptEnabled") // The app serves this fixed HTTPS origin and uses no native bridge.
        fun WebView.configure(onLoading: () -> Unit, onComplete: () -> Unit, onFailure: () -> Unit) {
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                allowFileAccess = false
                allowContentAccess = false
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                javaScriptCanOpenWindowsAutomatically = false
                setSupportMultipleWindows(false)
            }
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, false)
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                    !trusted(request.url)

                override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
                    if (!trusted(Uri.parse(url))) {
                        view.stopLoading()
                        onFailure()
                    } else onLoading()
                }

                override fun onPageFinished(view: WebView, url: String) = onComplete()

                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    if (request.isForMainFrame) onFailure()
                }

                override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
                    if (request.isForMainFrame) onFailure()
                }
            }
        }
    }
}
