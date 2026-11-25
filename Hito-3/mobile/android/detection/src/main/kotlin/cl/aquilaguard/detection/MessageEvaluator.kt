package cl.aquilaguard.detection

import cl.aquilaguard.core.DomainRisk
import java.text.Normalizer
import java.util.Locale

class MessageEvaluator(private val domains: DomainEvaluator) {
    data class Review(
        val links: DomainEvaluator.MessageLinkReview,
        val risk: DomainRisk,
        val reasons: List<String>,
    )

    fun review(text: String): Review {
        val links = domains.evaluateMessageLinks(text)
        val normalized = Normalizer.normalize(text, Normalizer.Form.NFKD)
            .replace(combiningMarks, "").lowercase(Locale.ROOT)
        val hasAction = action.containsMatchIn(normalized)
        val hasSensitiveRequest = sensitiveRequest.findAll(normalized).any { match ->
            val before = normalized.substring((match.range.first - 16).coerceAtLeast(0), match.range.first)
            !denial.containsMatchIn(before)
        }
        val hasPressure = pressure.containsMatchIn(normalized)
        val hasPayment = unexpectedPayment.containsMatchIn(normalized)
        val reasons = buildList {
            if (links.assessments.any { it.risk == DomainRisk.REPORTED }) {
                add("Un enlace coincide con un dominio de la copia local de reportes.")
            }
            if (links.assessments.any { it.risk == DomainRisk.SIGNALS }) {
                add("Un enlace contiene un dominio parecido al de un servicio conocido.")
            }
            if (hasSensitiveRequest) add("El mensaje parece pedir una clave, un código o datos de pago.")
            if (hasAction && hasPressure && (hasSensitiveRequest || links.assessments.isNotEmpty())) {
                add("El mensaje presiona para actuar con urgencia o evitar una suspensión.")
            }
            if (hasPayment && hasAction && links.assessments.isNotEmpty()) {
                add("El mensaje dirige a un enlace para cobrar por una entrega o reclamar un premio.")
            }
        }
        val risk = when {
            links.assessments.any { it.risk == DomainRisk.REPORTED } -> DomainRisk.REPORTED
            links.assessments.any { it.risk == DomainRisk.SIGNALS } ||
                hasPayment && hasAction && links.assessments.isNotEmpty() ||
                hasSensitiveRequest && (hasPressure || links.assessments.isNotEmpty()) -> DomainRisk.SIGNALS
            else -> DomainRisk.NO_MATCH
        }
        return Review(links, risk, reasons)
    }

    private companion object {
        val combiningMarks = Regex("\\p{M}+")
        val action = Regex("""\b(?:verifica|valida|actualiza|confirma|ingresa|introduce|envia|comparte|responde|paga|reclama|haz clic|pulsa|accede|verify|update|enter|submit|pay|claim|click)\b""")
        val sensitiveRequest = Regex("""\b(?:ingresa|introduce|envia|comparte|responde con|escribe|entrega|enter|send|share|provide)\b[^.\n!?]{0,48}\b(?:clave|contrasena|pin|codigo(?: de (?:seguridad|verificacion))?|datos (?:bancarios|de (?:tu )?tarjeta)|password|passcode|verification code|card details)\b""")
        val denial = Regex("""\b(?:no|nunca|do not|never)\s+$""")
        val pressure = Regex("""\b(?:urgente|inmediatamente|ahora mismo|ultimo aviso|en \d{1,3} (?:minutos|horas)|cuenta (?:suspendida|bloqueada)|(?:suspenderemos|bloquearemos) tu cuenta|immediately|final warning|account suspended)\b""")
        val unexpectedPayment = Regex("""\b(?:paquete|envio|pedido|entrega|parcel|delivery)\b[^.\n!?]{0,90}\b(?:retenid[oa]|pendiente de pago|aduana|tarifa|paga|fee)\b|\b(?:premio|sorteo|reward|prize)\b""")
    }
}
