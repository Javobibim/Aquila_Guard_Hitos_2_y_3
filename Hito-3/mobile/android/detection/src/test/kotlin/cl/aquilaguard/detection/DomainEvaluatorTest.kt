package cl.aquilaguard.detection
import cl.aquilaguard.core.DomainRisk
import org.junit.Assert.*
import org.junit.Test

class DomainEvaluatorTest {
 @Test fun messageReportsOnlyVisibleWebDomainsWithoutIncludingPathsOrEmailAddresses() {
  val review = engine.evaluateMessageLinks(
   "De: persona@www.example.cl\n" +
    "Portal (https://bancoestado.cl.acceso.example/verificar?dato=secreto).\n" +
    "Consulta <https://reportado.example/privado> y https://reportado.example/otro.\n" +
    "Referencia www.paypal.com."
  )
  assertEquals(
   listOf("bancoestado.cl.acceso.example", "reportado.example", "www.paypal.com"),
   review.assessments.map { it.hostname }
  )
  assertEquals(listOf(DomainRisk.SIGNALS, DomainRisk.REPORTED, DomainRisk.NO_MATCH), review.assessments.map { it.risk })
  assertFalse(review.truncated)
 }

 @Test fun messageReviewReportsWhenItsLinkLimitIsExceeded() {
  val message = (1..31).joinToString("\n") { "https://referencia-$it.example/" }
  val review = engine.evaluateMessageLinks(message)
  assertEquals(30, review.assessments.size)
  assertTrue(review.truncated)
 }
 @Test fun messageReviewReadsBareAndDefangedDomainsWithoutMistakingEmailAddresses() {
  val review = engine.evaluateMessageLinks(
   "Remitente: alguien@ignorar.example.\nAbre bancoestado.cl.acceso.example/ingreso o hxxps://repo\u200brtado[.]example/ver."
  )
  assertEquals(listOf("bancoestado.cl.acceso.example", "reportado.example"), review.assessments.map { it.hostname })
  assertEquals(listOf(DomainRisk.SIGNALS, DomainRisk.REPORTED), review.assessments.map { it.risk })
 }

 @Test fun embeddedSchemeDoesNotChangeHostnameParsing() {
  assertEquals("normal.example", engine.normalize("normal.example/redirect?next=https://bancoestado.cl/"))
 }
 @Test fun acceptsWebShorthandAndRejectsNonWebAddresses() {
  assertEquals("normal.example", engine.normalize("normal.example:443?email=user@example.com"))
  assertEquals("normal.example", engine.normalize("//normal.example/path"))
  assertThrows(IllegalArgumentException::class.java) { engine.normalize("mailto:user@example.com") }
 }
 private val engine=DomainEvaluator(setOf("reportado.example"),setOf("com","cl","co.uk","appspot.com","*.ck","!www.ck"),listOf(DomainEvaluator.Brand("PayPal",listOf("paypal"),listOf("paypal.com")),DomainEvaluator.Brand("BancoEstado",listOf("bancoestado"),listOf("bancoestado.cl"))))
 @Test fun reportsAreExact(){assertEquals(DomainRisk.REPORTED,engine.evaluate("https://reportado.example/ruta?clave=no_guardar").risk);assertEquals(DomainRisk.REPORTED,engine.evaluate("www.reportado.example").risk);assertEquals(DomainRisk.NO_MATCH,engine.evaluate("otro.reportado.example").risk)}
 @Test fun officialDoesNotTrigger(){assertEquals(DomainRisk.NO_MATCH,engine.evaluate("https://www.paypal.com/").risk);assertEquals(DomainRisk.NO_MATCH,engine.evaluate("https://www.bancoestado.cl/").risk)}
 @Test fun brandAndTypo(){assertEquals(DomainRisk.SIGNALS,engine.evaluate("bancoestado.cl.acceso.example").risk);assertEquals(DomainRisk.SIGNALS,engine.evaluate("paypaal.example").risk)}
 @Test fun suffixes(){assertEquals("empresa.co.uk",engine.registered("login.empresa.co.uk"));assertEquals("cliente.appspot.com",engine.registered("login.cliente.appspot.com"));assertEquals("www.ck",engine.registered("foo.www.ck"))}
 @Test fun noInventedObservations(){val r=engine.evaluate("https://normal.example/clave?next=paypal.example#secreto");assertEquals(DomainRisk.NO_MATCH,r.risk);assertEquals("normal.example",r.hostname);assertTrue(r.reasons.isEmpty())}
 @Test fun normalization(){assertEquals("xn--bcher-kva.example",engine.normalize("BÜCHER.example."));assertEquals("paypal.com",engine.normalize("https://usuario:clave@paypal.com/"))}
 @Test fun malformedRejected(){for(s in listOf("javascript:alert(1)","dominio con espacios.example","a..example","https://","https://dominio.example:99999","127.0.0.1","https://[::1]/","0x7f.1")){try{engine.evaluate(s);fail(s)}catch(_:IllegalArgumentException){}}}
}
