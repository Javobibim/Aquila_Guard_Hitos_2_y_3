package cl.aquilaguard.protection

import cl.aquilaguard.core.DomainAssessment
import cl.aquilaguard.core.DomainRisk
import java.net.InetAddress
import org.junit.Assert.*
import org.junit.Test

class DnsPacketTest {
    @Test fun ignoresConnectivityProbesThatAreNotDnsQueries() {
        for ((from, to, protocolOffset) in listOf(
            Triple(DnsPacket.LOCAL_V4, DnsPacket.DNS_V4, 9),
            Triple(DnsPacket.LOCAL_V6, DnsPacket.DNS_V6, 6)
        )) {
            val source = InetAddress.getByName(from).address
            val destination = InetAddress.getByName(to).address
            val tlsProbe = DnsPacket.encode(source, destination, 49152, 853, dnsQuery)
                .apply { this[protocolOffset] = 6 }
            assertNull(DnsPacket.query(tlsProbe, tlsProbe.size))
            val other = tlsProbe.copyOf().apply { this[protocolOffset] = 1 }
            assertNull(DnsPacket.query(other, other.size))
        }
    }
    private val dnsQuery = "123401000001000000000000076578616d706c6503636f6d0000010001"
        .chunked(2).map { it.toInt(16).toByte() }.toByteArray()

    @Test fun forwardsIpv4AndIpv6WithChecksums() {
        val pairs = listOf(DnsPacket.LOCAL_V4 to DnsPacket.DNS_V4, DnsPacket.LOCAL_V6 to DnsPacket.DNS_V6)
        for ((from, to) in pairs) {
            val local = InetAddress.getByName(from).address
            val virtualDns = InetAddress.getByName(to).address
            val bytes = DnsPacket.encode(local, virtualDns, 49152, 53, dnsQuery)
            val request = checkNotNull(DnsPacket.query(bytes, bytes.size))
            assertEquals("example.com", DnsWire.name(request.payload))
            assertEquals(49152, request.sourcePort)
            assertArrayEquals(dnsQuery, request.payload)

            val nxdomain = dnsQuery.copyOf().apply { this[2] = 0x81.toByte(); this[3] = 0x83.toByte() }
            val reply = request.reply(nxdomain)
            val ipHeader = if (local.size == 4) 20 else 40
            assertEquals(53, DnsWire.u16(reply, ipHeader))
            assertEquals(49152, DnsWire.u16(reply, ipHeader + 2))
            assertArrayEquals(nxdomain, reply.copyOfRange(ipHeader + 8, reply.size))
            val addresses = if (ipHeader == 20) 12 else 8
            assertArrayEquals(virtualDns + local, reply.copyOfRange(addresses, addresses + local.size * 2))

            if (ipHeader == 20) assertEquals(0xffff, folded(reply.copyOfRange(0, ipHeader)))
            val udp = reply.copyOfRange(ipHeader, reply.size)
            val pseudo = virtualDns + local + byteArrayOf(0, 17, 0, udp.size.toByte())
            assertEquals(0xffff, folded(pseudo + udp))
        }
    }

    @Test fun refusesTruncationTcpAndOversize() {
        val local = InetAddress.getByName(DnsPacket.LOCAL_V4).address
        val virtualDns = InetAddress.getByName(DnsPacket.DNS_V4).address
        val query = DnsPacket.encode(local, virtualDns, 49152, 53, dnsQuery)
        assertThrows(IllegalArgumentException::class.java) { DnsPacket.query(query, query.size - 1) }
        val tcp = query.copyOf().apply { this[9] = 6 }
        val unsupported = assertThrows(DnsTransportException::class.java) { DnsPacket.query(tcp, tcp.size) }
        assertTrue(unsupported.message.orEmpty().contains("TCP"))
        val request = checkNotNull(DnsPacket.query(query, query.size))
        assertThrows(IllegalArgumentException::class.java) { request.reply(ByteArray(DnsPacket.MTU)) }
        val otherIp = InetAddress.getByName("192.0.2.99").address
        val other = DnsPacket.encode(local, otherIp, 49152, 53, dnsQuery)
        assertNull(DnsPacket.query(other, other.size))
    }

    @Test fun repeatsAnAlertAfterFiveSecondsAndLetsOtherRisksThrough() {
        val limiter = AlertLimiter()
        val medium = DomainAssessment("test.example", DomainRisk.SIGNALS, listOf("Señal"))
        val high = medium.copy(risk = DomainRisk.REPORTED)
        assertFalse(limiter.allow(medium.copy(risk = DomainRisk.NO_MATCH), 0))
        assertTrue(limiter.allow(medium, 0))
        assertTrue(limiter.allow(high, 0))
        assertTrue(limiter.allow(medium.copy(hostname = "second.example"), 0))
        assertFalse(limiter.allow(medium, 4999))
        assertTrue(limiter.allow(medium, 5000))
        assertFalse(limiter.allow(medium, 5001))
    }

    @Test fun rejectsAnswersForAnotherRecordType() {
        val wrongType = dnsQuery.copyOf().apply { this[2] = 0x81.toByte(); this[size - 3] = 28 }
        assertThrows(IllegalArgumentException::class.java) { DnsWire.validateReply(dnsQuery, wrongType) }
    }

    private fun folded(bytes: ByteArray): Int {
        val padded = if (bytes.size % 2 == 0) bytes else bytes + byteArrayOf(0)
        return padded.indices.step(2).fold(0) { sum, index ->
            val word = (padded[index].toInt() and 255) * 256 + (padded[index + 1].toInt() and 255)
            val next = sum + word
            (next and 0xffff) + (next ushr 16)
        }
    }
}
