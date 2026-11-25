package cl.aquilaguard.detection

import cl.aquilaguard.core.DomainAssessment
import cl.aquilaguard.core.DomainRisk
import java.net.IDN
import java.net.URI
import java.util.Locale

/** Hostname solamente: no infiere protocolo, ruta, DOM ni navegación observada. */
class DomainEvaluator(private val reports: Set<String>, private val suffixes: Set<String>, private val brands: List<Brand>) {
    data class Brand(val name: String, val tokens: List<String>, val domains: List<String>)
    data class MessageLinkReview(val assessments: List<DomainAssessment>, val truncated: Boolean)

    fun evaluateMessageLinks(text: String): MessageLinkReview {
        require(text.length <= 50_000) { "Pega un texto de hasta 50.000 caracteres." }
        val normalized = text.replace(invisible, "")
            .replace("[.]", ".").replace("(.)", ".")
            .replace(defangedScheme) { if (it.value.startsWith("hxxps", ignoreCase = true)) "https://" else "http://" }
        val hosts = messageLink.findAll(normalized).mapNotNull { match ->
            val address = match.value.trimEnd('.', ',', ';', ':', '!', '?', ')', ']', '}', '»', '”', '’')
            val host = runCatching { normalize(address) }.getOrNull() ?: return@mapNotNull null
            if (schemePrefix.containsMatchIn(address) || address.startsWith("//") ||
                host.startsWith("www.") || host.substringAfterLast('.') in suffixes || host.endsWith(".example")) host
            else null
        }.distinct().take(31).toList()
        return MessageLinkReview(hosts.take(30).map(::evaluateHost), truncated = hosts.size > 30)
    }

    fun normalize(input: String): String {
        require(input.length <= 8192 && input.isNotBlank()) { "Pega un dominio o enlace de hasta 8192 caracteres." }
        require(input.none { it.isWhitespace() || it == '\\' || it.code < 32 }) { "La dirección contiene caracteres no válidos." }
        val address = when {
            schemePrefix.containsMatchIn(input) -> input
            input.startsWith("//") -> "https:$input"
            else -> {
                require('@' !in input.takeWhile { it !in "/?#" }) { "Pega un dominio o un enlace HTTP/HTTPS." }
                "https://$input"
            }
        }
        val uri = try { URI(address) } catch (_: java.net.URISyntaxException) { throw IllegalArgumentException("Dominio no válido.") }
        require(uri.scheme?.lowercase(Locale.ROOT) in listOf("https", "http")) { "Solo se admiten dominios o enlaces web." }
        val authority = requireNotNull(uri.rawAuthority) { "Dominio no válido." }.substringAfterLast('@')
        require(!authority.startsWith("[")) { "Esta revisión limitada necesita un nombre de dominio." }
        if (':' in authority) {
            val portText = authority.substringAfter(':')
            val port = portText.takeIf { it.all { digit -> digit in '0'..'9' } }?.toIntOrNull()
            require(port != null && port in 1..65535) { "El puerto no es válido." }
        }
        val ascii = try {
            IDN.toASCII(authority.substringBefore(':'), IDN.USE_STD3_ASCII_RULES).lowercase(Locale.ROOT).removeSuffix(".")
        } catch (_: IllegalArgumentException) {
            throw IllegalArgumentException("Dominio no válido.")
        }
        require(ascii.length in 1..253 && ascii.contains('.') && ascii.split('.').all { it.isNotBlank() && it.length <= 63 }) { "Dominio no válido." }
        require(!numericLabel.matches(ascii.substringAfterLast('.'))) { "Esta revisión necesita un nombre de dominio, no una dirección IP." }
        return ascii
    }
    fun registered(host: String): String {
        val labels = host.split('.')
        var count = 1
        for (i in labels.indices) {
            val suffix = labels.drop(i).joinToString(".")
            if ("!$suffix" in suffixes) { count = labels.size-i-1; break }
            if (suffix in suffixes) count = maxOf(count, labels.size-i)
            if (i > 0 && "*.$suffix" in suffixes) count = maxOf(count, labels.size-i+1)
        }
        return labels.takeLast(minOf(count+1, labels.size)).joinToString(".")
    }
    fun evaluate(input: String): DomainAssessment = evaluateHost(normalize(input))

    private fun evaluateHost(host: String): DomainAssessment {
        if (host in reports || (host.startsWith("www.") && host.removePrefix("www.") in reports))
            return DomainAssessment(host, DomainRisk.REPORTED, listOf("El dominio coincide con la copia local de PhishDestroy. Puede contener errores o haber cambiado; comprueba por un canal oficial."))
        val reasons = mutableListOf<String>(); val label = registered(host).substringBefore('.'); val labels=host.split('.', '-')
        for (brand in brands) {
            if (brand.domains.any { host == it || host.endsWith(".$it") }) continue
            if (brand.tokens.any { it in labels || (label.startsWith(it) && label.removePrefix(it) in brandSuffixes) }) {
                reasons.add("El dominio menciona ${brand.name}, pero no pertenece a los dominios de referencia incluidos. No confirma fraude."); break
            }
            if (brand.tokens.any { near(label,it) }) { reasons.add("El dominio se parece al nombre de ${brand.name} con una escritura diferente. Verifica el origen."); break }
        }
        val risk = if (reasons.isEmpty()) DomainRisk.NO_MATCH else DomainRisk.SIGNALS
        return DomainAssessment(host, risk, reasons)
    }
    private fun near(a:String,b:String):Boolean {
        if(a==b || a.length<5 || b.length<5 || kotlin.math.abs(a.length-b.length)>1)return false
        if(a.length==b.length){val differences=a.indices.filter{a[it]!=b[it]};return differences.size==1||(differences.size==2&&differences[1]==differences[0]+1&&a[differences[0]]==b[differences[1]]&&a[differences[1]]==b[differences[0]])}
        val short=if(a.length<b.length)a else b;val long=if(a.length<b.length)b else a;var i=0;var j=0;var skip=0
        while(i<short.length&&j<long.length){if(short[i]==long[j]){i++;j++}else{skip++;j++;if(skip>1)return false}}
        return true
    }

    private companion object {
        val schemePrefix = Regex("^[a-zA-Z][a-zA-Z0-9+.-]*://")
        val numericLabel = Regex("[0-9]+|0x[0-9a-f]+")
        val brandSuffixes = setOf("secure", "seguridad", "login", "signin", "verify", "validar", "soporte", "support", "cuenta")
        val invisible = Regex("[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]")
        val defangedScheme = Regex("""\bhxxps?://""", RegexOption.IGNORE_CASE)
        val messageLink = Regex(
            """(?<![\p{L}\p{N}_@./-])(?:(?:https?:)?//[^\s<>"'“”‘’«»]+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?::\d{1,5})?(?:[/?#][^\s<>"'“”‘’«»]*)?(?![\w@-]))""",
            RegexOption.IGNORE_CASE,
        )
    }
}
