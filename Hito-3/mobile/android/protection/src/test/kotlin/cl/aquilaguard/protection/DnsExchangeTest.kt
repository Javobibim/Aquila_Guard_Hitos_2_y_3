package cl.aquilaguard.protection

import cl.aquilaguard.core.DomainRisk
import cl.aquilaguard.detection.DomainEvaluator
import java.io.IOException
import java.net.InetAddress
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class DnsExchangeTest {
    @Test fun browserTestRequiresAnObservedDnsReplyAndIsConsumedOnce() = runBlocking {
        val trial = BrowserAlertTest()
        assertFalse(trial.arm("reported.example", 0))
        assertFalse(trial.consume("example.org", 0))
        assertTrue(trial.arm("example.org", 0))
        assertTrue(trial.isPending("example.org", 10))
        assertFalse(trial.consume("example.net", 10))
        val query = question("example.org")
        val exchange = DnsExchange(resolve = { reply(query) }, send = {})
        val observed = checkNotNull(exchange.relay(datagram(query)))
        assertTrue(trial.consume(observed, 20))
        assertFalse(trial.isPending("example.org", 21))
        assertFalse(trial.consume(observed, 21))
    }

    @Test fun browserTestExpiresAndCanBeCleared() {
        val trial = BrowserAlertTest()
        assertTrue(trial.arm("example.net", 100))
        assertFalse(trial.consume("example.net", 30_100))
        assertTrue(trial.arm("example.net", 31_000))
        trial.clear()
        assertFalse(trial.consume("example.net", 31_001))
    }

    @Test fun forwardsIpv6AddressAnswersThroughTheIpv4DnsRoute() = runBlocking {
        val query = question("control.example").apply { this[size - 3] = 28 }
        val address = InetAddress.getByName("2001:db8::123").address
        val response = reply(query).apply { this[7] = 1 } +
            byteArrayOf(0xc0.toByte(), 12, 0, 28, 0, 1, 0, 0, 0, 30, 0, 16) + address
        val client = InetAddress.getByName(DnsPacket.LOCAL_V4).address
        val server = InetAddress.getByName(DnsPacket.DNS_V4).address
        val packet = DnsPacket.encode(client, server, 49152, 53, query)
        val request = checkNotNull(DnsPacket.query(packet, packet.size))
        val sent = mutableListOf<ByteArray>()

        val name = DnsExchange(resolve = { response }, send = { sent += it }).relay(request)

        assertEquals("control.example", name)
        assertArrayEquals(response, sent.single().copyOfRange(28, sent.single().size))
    }

    @Test fun forwardsAValidCompressedRecordAndRejectsAForwardPointer() = runBlocking {
        val question = question("control.example")
        val recordStart = question.size
        val response = reply(question).apply { this[7] = 1 } +
            byteArrayOf(0xc0.toByte(), 12, 0, 1, 0, 1, 0, 0, 0, 30, 0, 4, 192.toByte(), 0, 2, 1)
        val writes = mutableListOf<ByteArray>()
        val exchange = DnsExchange(resolve = { response }, send = { writes += it })
        assertEquals("control.example", exchange.relay(datagram(question)))
        assertEquals(1, writes.size)
        assertArrayEquals(response, writes.single().copyOfRange(48, writes.single().size))

        val invalid = response.copyOf().apply { this[recordStart + 1] = (recordStart + 2).toByte() }
        assertThrows(IllegalArgumentException::class.java) {
            DnsWire.validateReply(question, invalid)
        }
        assertEquals(1, writes.size)
    }

    @Test fun rejectsAnAnswerThatClaimsRecordsOutsideItsPayload() {
        val question = question("reported.example")
        val incomplete = reply(question).apply { this[7] = 1 }
        val exchange = DnsExchange(resolve = { incomplete }, send = { fail("Unexpected write") })
        assertThrows(IllegalArgumentException::class.java) {
            runBlocking { exchange.relay(datagram(question)) }
        }
    }

    @Test fun extendedDnsErrorIsForwardedWithoutMarkingItUsable() = runBlocking {
        val question = question("reported.example")
        val response = reply(question).apply { this[11] = 1 } +
            byteArrayOf(0, 0, 41, 4, 0xd0.toByte(), 1, 0, 0, 0, 0, 0)
        var written = false
        val exchange = DnsExchange(resolve = { response }, send = { written = true })
        assertNull(exchange.relay(datagram(question)))
        assertTrue(written)
    }

    @Test fun validRootQueryCanBeForwarded() = runBlocking {
        val root = question("")
        val exchange = DnsExchange(resolve = { reply(root) }, send = {})
        assertEquals(".", exchange.relay(datagram(root)))
    }

    private val evaluator = DomainEvaluator(
        setOf("reported.example"),
        setOf("cl", "com"),
        listOf(DomainEvaluator.Brand("BancoEstado", listOf("bancoestado"), listOf("bancoestado.cl")))
    )

    @Test fun resolvesAndWritesBeforeReportingBothRiskLevels() = runBlocking {
        for ((hostname, risk) in listOf(
            "bancoestado.cl.acceso.example" to DomainRisk.SIGNALS,
            "reported.example" to DomainRisk.REPORTED,
            "bancoestado.cl" to DomainRisk.NO_MATCH
        )) {
            val question = question(hostname)
            val answer = reply(question, rcode = if (risk == DomainRisk.NO_MATCH) 0 else 3)
            val events = mutableListOf<String>()
            val exchange = DnsExchange(
                resolve = { packet ->
                    assertArrayEquals(question, packet)
                    events += "upstream"
                    answer
                },
                send = { packet ->
                    assertArrayEquals(answer, packet.copyOfRange(48, packet.size))
                    events += "tun"
                }
            )
            val observed = checkNotNull(exchange.relay(datagram(question)))
            assertEquals(listOf("upstream", "tun"), events)
            assertEquals(hostname, observed)
            assertEquals(risk, evaluator.evaluate(observed).risk)
        }
    }

    @Test fun resolverErrorCanBeForwardedWithoutProducingAnObservation() = runBlocking {
        val question = question("reported.example")
        val servfail = reply(question, rcode = 2)
        var written = false
        val exchange = DnsExchange(resolve = { servfail }, send = { written = true })
        assertNull(exchange.relay(datagram(question)))
        assertTrue(written)
    }

    @Test fun mismatchedOrTruncatedAnswerIsNeverWritten() {
        val question = question("reported.example")
        val mismatch = reply(question).apply { this[1] = 0x11 }
        val truncated = reply(question).apply { this[2] = 0x83.toByte() }
        for (answer in listOf(mismatch, truncated)) {
            val exchange = DnsExchange(resolve = { answer }, send = { fail("Unexpected write") })
            assertThrows(IllegalArgumentException::class.java) {
                runBlocking { exchange.relay(datagram(question)) }
            }
        }
    }

    @Test fun timeoutCancelsResolverAndDoesNotWrite() {
        var cancelled = false
        val exchange = DnsExchange(
            resolve = {
                try { awaitCancellation() } finally { cancelled = true }
            },
            send = { fail("Unexpected write") },
            timeoutMillis = 100
        )
        assertThrows(IOException::class.java) {
            runBlocking { exchange.relay(datagram(question("reported.example"))) }
        }
        assertTrue(cancelled)
    }

    @Test fun tunWriteFailureDoesNotProduceAnObservation() {
        val question = question("reported.example")
        val exchange = DnsExchange(resolve = { reply(question) }, send = { throw IOException("closed") })
        val error = assertThrows(IOException::class.java) {
            runBlocking { exchange.relay(datagram(question)) }
        }
        assertEquals("closed", error.message)
    }

    private fun question(name: String): ByteArray {
        val labels = name.takeIf { it.isNotEmpty() }?.split('.')?.flatMap { label ->
            listOf(label.length.toByte()) + label.toByteArray().toList()
        }.orEmpty()
        return byteArrayOf(0x12, 0x34, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0) +
            labels.toByteArray() + byteArrayOf(0, 0, 1, 0, 1)
    }

    private fun datagram(query: ByteArray): DnsPacket.Datagram {
        val client = InetAddress.getByName(DnsPacket.LOCAL_V6).address
        val server = InetAddress.getByName(DnsPacket.DNS_V6).address
        val packet = DnsPacket.encode(client, server, 49152, 53, query)
        return checkNotNull(DnsPacket.query(packet, packet.size))
    }

    private fun reply(question: ByteArray, rcode: Int = 0): ByteArray =
        question.copyOf().apply {
            this[2] = 0x81.toByte()
            this[3] = (0x80 or rcode).toByte()
        }
}
