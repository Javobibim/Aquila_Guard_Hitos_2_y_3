package cl.aquilaguard.protection

import java.net.InetAddress

internal class DnsTransportException(message: String) : IllegalArgumentException(message)

/** Handles UDP addressed to the two DNS hosts routed into the TUN. */
internal object DnsPacket {
    const val LOCAL_V4 = "192.0.2.2"
    const val DNS_V4 = "192.0.2.53"
    const val LOCAL_V6 = "fd64:a91:6a7d:1::2"
    const val DNS_V6 = "fd64:a91:6a7d:1::53"
    const val MTU = 1500

    private val dnsV4 = InetAddress.getByName(DNS_V4).address
    private val dnsV6 = InetAddress.getByName(DNS_V6).address

    data class Datagram(val source: ByteArray, val destination: ByteArray, val sourcePort: Int, val payload: ByteArray) {
        fun reply(payload: ByteArray): ByteArray = encode(destination, source, 53, sourcePort, payload)
    }

    fun query(packet: ByteArray, size: Int): Datagram? {
        if (size < 20) return null
        val ipv6 = when (packet[0].toInt() ushr 4 and 15) {
            4 -> false
            6 -> true
            else -> return null
        }
        if (ipv6 && size < 40) return null
        val start = if (ipv6) 8 else 12
        val addressLength = if (ipv6) 16 else 4
        val destination = packet.copyOfRange(start + addressLength, start + addressLength * 2)
        if (!destination.contentEquals(if (ipv6) dnsV6 else dnsV4)) return null

        val header = if (ipv6) 40 else (packet[0].toInt() and 15) * 4
        val length = if (ipv6) 40 + DnsWire.u16(packet, 4) else DnsWire.u16(packet, 2)
        require(header >= (if (ipv6) 40 else 20) && length in header..size)
        val protocol = packet[if (ipv6) 6 else 9].toInt() and 255
        if (protocol != 6 && protocol != 17) return null
        // A later IPv4 fragment has no transport header to inspect.
        if (!ipv6 && DnsWire.u16(packet, 6) and 0x1fff != 0) return null
        if (length < header + 4 || DnsWire.u16(packet, header + 2) != 53) return null
        // Only traffic to the DNS port can show that the resolver needs a transport we cannot forward.
        if (protocol == 6) throw DnsTransportException("La red solicitó DNS sobre TCP.")
        if (!ipv6 && DnsWire.u16(packet, 6) and 0x2000 != 0) {
            throw DnsTransportException("La consulta DNS llegó con un formato de red que esta beta no puede reenviar.")
        }
        require(length >= header + 8) { "Cabecera UDP incompleta." }
        val udpLength = DnsWire.u16(packet, header + 4)
        require(udpLength >= 8 && header + udpLength == length)
        return Datagram(packet.copyOfRange(start, start + addressLength), destination, DnsWire.u16(packet, header), packet.copyOfRange(header + 8, length))
    }

    internal fun encode(source: ByteArray, destination: ByteArray, sourcePort: Int, destinationPort: Int, data: ByteArray): ByteArray {
        val ipv6 = source.size == 16
        val header = if (ipv6) 40 else 20
        val udpLength = 8 + data.size
        if (header + udpLength > MTU) throw DnsTransportException("La respuesta DNS supera el tamaño que admite esta beta.")
        val packet = ByteArray(header + udpLength)
        if (ipv6) {
            packet[0] = 0x60
            write16(packet, 4, udpLength)
            packet[6] = 17
            packet[7] = 64
            source.copyInto(packet, 8)
            destination.copyInto(packet, 24)
        } else {
            packet[0] = 0x45
            write16(packet, 2, packet.size)
            packet[8] = 64
            packet[9] = 17
            source.copyInto(packet, 12)
            destination.copyInto(packet, 16)
            write16(packet, 10, checksum(packet, 0, header))
        }
        write16(packet, header, sourcePort)
        write16(packet, header + 2, destinationPort)
        write16(packet, header + 4, udpLength)
        data.copyInto(packet, header + 8)
        val pseudoHeader = words(source, 0, source.size) + words(destination, 0, destination.size) + 17 + udpLength
        val udpChecksum = checksum(packet, header, packet.size, pseudoHeader)
        write16(packet, header + 6, if (udpChecksum == 0) 0xffff else udpChecksum)
        return packet
    }

    private fun write16(packet: ByteArray, index: Int, value: Int) {
        packet[index] = (value ushr 8).toByte()
        packet[index + 1] = value.toByte()
    }

    private fun words(packet: ByteArray, start: Int, end: Int): Int {
        var sum = 0
        for (index in start until end step 2) {
            sum += if (index + 1 < end) DnsWire.u16(packet, index) else (packet[index].toInt() and 255) shl 8
        }
        return sum
    }

    private fun checksum(packet: ByteArray, start: Int, end: Int, initial: Int = 0): Int {
        var sum = initial + words(packet, start, end)
        while (sum > 0xffff) sum = (sum and 0xffff) + (sum ushr 16)
        return sum.inv() and 0xffff
    }
}
