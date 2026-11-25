package cl.aquilaguard.protection

import android.net.DnsResolver
import android.net.Network
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.system.ErrnoException
import android.system.Os
import android.system.OsConstants
import android.system.StructPollfd
import java.io.IOException
import java.util.concurrent.Executor
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine

internal class DnsTunnel(
    private val descriptor: ParcelFileDescriptor,
    private val resolve: suspend (ByteArray) -> ByteArray,
    private val onPacket: () -> Unit,
    private val onQuery: () -> Unit,
    private val onAnswer: suspend (String?) -> Unit
) : AutoCloseable {
    private val tunnelFd = descriptor.fileDescriptor
    private val writeLock = Any()
    private var closed = false

    override fun close() {
        synchronized(writeLock) {
            if (closed) return
            closed = true
            descriptor.close()
        }
    }

    suspend fun run(): Unit = coroutineScope {
        val pending = Channel<DnsPacket.Datagram>(16)
        val exchange = DnsExchange(resolve, ::write)

        repeat(4) {
            launch {
                for (datagram in pending) {
                    onAnswer(exchange.relay(datagram))
                }
            }
        }

        val poll = StructPollfd()
        poll.fd = tunnelFd
        poll.events = OsConstants.POLLIN.toShort()
        val fds = arrayOf(poll)
        val buffer = ByteArray(DnsPacket.MTU)
        try {
            while (isActive) {
                if (Os.poll(fds, 750) == 0) continue
                if (poll.revents.toInt() and OsConstants.POLLIN == 0) throw IOException("Interfaz DNS cerrada.")
                val size = try {
                    Os.read(tunnelFd, buffer, 0, buffer.size)
                } catch (error: ErrnoException) {
                    if (error.errno == OsConstants.EAGAIN) continue
                    throw error
                }
                if (size <= 0) throw IOException("Interfaz DNS cerrada.")
                onPacket()
                val datagram = DnsPacket.query(buffer, size) ?: continue
                onQuery()
                if (!pending.trySend(datagram).isSuccess) throw IOException("Cola DNS saturada.")
            }
        } finally {
            pending.cancel()
        }
    }

    private fun write(packet: ByteArray) {
        synchronized(writeLock) {
            if (closed || Os.write(tunnelFd, packet, 0, packet.size) != packet.size) {
                throw IOException("La respuesta DNS no llegó a la interfaz.")
            }
        }
    }
}

@androidx.annotation.RequiresApi(29)
internal class PlatformDns(private val network: Network) {
    suspend fun query(request: ByteArray): ByteArray = resolve { executor, cancellation, callback ->
        // Android caches by network and restores the caller's original transaction ID.
        DnsResolver.getInstance().rawQuery(network, request, DnsResolver.FLAG_EMPTY, executor, cancellation, callback)
    }

    suspend fun checkConnection(hostname: String = PROBE_DOMAIN): Boolean {
        val answer = resolve { executor, cancellation, callback ->
            DnsResolver.getInstance().rawQuery(
                network, hostname, DnsResolver.CLASS_IN, DnsResolver.TYPE_A,
                DnsResolver.FLAG_NO_CACHE_LOOKUP or DnsResolver.FLAG_NO_CACHE_STORE,
                executor, cancellation, callback
            )
        }
        return answer.size >= 12 && answer[3].toInt() and 15 == 0 && DnsWire.u16(answer, 6) > 0
    }

    private suspend fun resolve(
        start: (Executor, CancellationSignal, DnsResolver.Callback<ByteArray>) -> Unit
    ): ByteArray = suspendCancellableCoroutine { continuation ->
        val cancellation = CancellationSignal()
        continuation.invokeOnCancellation { cancellation.cancel() }
        start(
            Executor { it.run() },
            cancellation,
            object : DnsResolver.Callback<ByteArray> {
                override fun onAnswer(answer: ByteArray, rcode: Int) = continuation.resume(answer)
                override fun onError(error: DnsResolver.DnsException) = continuation.resumeWithException(error)
            }
        )
    }

    companion object {
        const val PROBE_DOMAIN = "aquila-guard-a3ddd.web.app"
    }
}
