package cl.aquilaguard.protection

import java.net.SocketTimeoutException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withTimeoutOrNull

internal class DnsExchange(
    private val resolve: suspend (ByteArray) -> ByteArray,
    private val send: (ByteArray) -> Unit,
    private val timeoutMillis: Long = 3500
) {
    /** A name becomes observable only after its valid answer has been delivered to TUN. */
    suspend fun relay(datagram: DnsPacket.Datagram): String? {
        val query = datagram.payload
        require(query.size >= 12 && query[2].toInt() and 0xf8 == 0)
        val name = DnsWire.name(query)
        val answer = withTimeoutOrNull(timeoutMillis) { resolve(query) }
            ?: throw SocketTimeoutException("El resolutor no respondió a tiempo.")
        val rcode = DnsWire.validateReply(query, answer)
        if (answer[2].toInt() and 2 != 0) throw DnsTransportException("El resolutor devolvió una respuesta truncada que requiere DNS sobre TCP.")
        currentCoroutineContext().ensureActive()
        send(datagram.reply(answer))
        return when (rcode) {
            0, 3 -> name
            else -> null
        }
    }
}
