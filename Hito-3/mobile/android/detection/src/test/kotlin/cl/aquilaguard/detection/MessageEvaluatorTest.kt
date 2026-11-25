package cl.aquilaguard.detection

import cl.aquilaguard.core.DomainRisk
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MessageEvaluatorTest {
    private val evaluator = MessageEvaluator(DomainEvaluator(
        setOf("dominio-reportado.example"), setOf("cl", "com"),
        listOf(DomainEvaluator.Brand("BancoEstado", listOf("bancoestado"), listOf("bancoestado.cl"))),
    ))

    @Test fun reportedLinkUsesHighestRiskAndGenericExplanation() {
        val result = evaluator.review("Revisa hxxps://dominio-reportado[.]example/cuenta?token=privado")
        assertEquals(DomainRisk.REPORTED, result.risk)
        assertEquals("dominio-reportado.example", result.links.assessments.single().hostname)
        assertTrue(result.reasons.none { "privado" in it || "dominio-reportado" in it })
    }

    @Test fun brandImitationAloneIsPrecaution() {
        assertEquals(DomainRisk.SIGNALS,
            evaluator.review("Visita https://bancoestado.cl.acceso.example/verificar").risk)
        assertEquals(DomainRisk.NO_MATCH, evaluator.review("Conoce https://www.bancoestado.cl").risk)
    }

    @Test fun urgencyAndCredentialRequestCanWarnWithoutLinks() {
        val result = evaluator.review("Último aviso: responde con tu código de verificación ahora mismo.")
        assertEquals(DomainRisk.SIGNALS, result.risk)
        assertTrue(result.links.assessments.isEmpty())
        assertEquals(2, result.reasons.size)
    }

    @Test fun deliveryScamUsesCombinedTextAndLinkSignals() {
        assertEquals(DomainRisk.SIGNALS,
            evaluator.review("Paquete retenido. Paga en https://envios.example/cobro").risk)
        assertEquals(DomainRisk.NO_MATCH, evaluator.review("Tu paquete fue entregado.").risk)
    }

    @Test fun legitimateOtpAndGenericUrgencyDoNotTrigger() {
        assertEquals(DomainRisk.NO_MATCH,
            evaluator.review("Tu código es 123456. Nunca compartas tu código.").risk)
        assertEquals(DomainRisk.NO_MATCH, evaluator.review("Never share your password.").risk)
        assertEquals(DomainRisk.SIGNALS, evaluator.review(
            "Nunca compartas tu código. Último aviso: responde con tu código ahora mismo."
        ).risk)
        assertEquals(DomainRisk.NO_MATCH,
            evaluator.review("Urgente: lee los apuntes en https://universidad.example/curso").risk)
        assertFalse(evaluator.review("Nos vemos a las ocho.").links.truncated)
    }
}
