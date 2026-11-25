package cl.aquilaguard.protection

import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetSocketAddress
import java.net.Socket
import java.io.DataInputStream
import java.io.DataOutputStream

/** Reenvía mensajes DNS; NO implementa IP/TUN ni una VPN. Probado solo con servidores locales. */
class DnsForwarder(private val upstream:InetSocketAddress,private val protectUdp:(DatagramSocket)->Boolean,private val protectTcp:(Socket)->Boolean,private val timeoutMs:Int=3000) {
    fun exchange(query:ByteArray):ByteArray {
        require(query.size in 12..4096&&query[2].toInt() and 128==0&&query[2].toInt() and 120==0)
        DnsWire.name(query)
        val response=DatagramSocket().use{socket->
            check(protectUdp(socket)) { "No se pudo proteger el socket de salida." }
            socket.soTimeout=timeoutMs;socket.connect(upstream)
            socket.send(DatagramPacket(query,query.size));val packet=DatagramPacket(ByteArray(65535),65535);socket.receive(packet);packet.data.copyOf(packet.length)
        }
        DnsWire.validateReply(query,response)
        if(response[2].toInt() and 2==0)return response
        return Socket().use{socket->
            check(protectTcp(socket)) { "No se pudo proteger el socket TCP de salida." }
            socket.soTimeout=timeoutMs;socket.connect(upstream,timeoutMs)
            DataOutputStream(socket.getOutputStream()).apply{writeShort(query.size);write(query);flush()}
            val input=DataInputStream(socket.getInputStream());val length=input.readUnsignedShort();require(length in 12..65535)
            val full=ByteArray(length);input.readFully(full);DnsWire.validateReply(query,full);full
        }
    }
}
