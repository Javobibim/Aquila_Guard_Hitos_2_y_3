package cl.aquilaguard.protection
import org.junit.Assert.*
import org.junit.Assume.assumeNoException
import org.junit.Test
import java.net.*
import java.io.*
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class DnsForwarderTest {
 private fun query():ByteArray=byteArrayOf(0x12,0x34,1,0,0,1,0,0,0,0,0,0,7)+"control".toByteArray()+byteArrayOf(7)+"example".toByteArray()+byteArrayOf(0,0,1,0,1)
 private fun reply(q:ByteArray,truncated:Boolean=false):ByteArray=q.copyOf().apply{this[2]=(if(truncated)0x83 else 0x81).toByte();this[3]=0x83.toByte()}
 @Test fun parsesQuestionAndRejectsCycle(){assertEquals("control.example",DnsWire.name(query()));val cycle=query().copyOf();cycle[12]=0xc0.toByte();cycle[13]=12;try{DnsWire.name(cycle);fail()}catch(_:IllegalArgumentException){}}
 @Test fun rejectsTruncatedAndWrongReply(){for(n in listOf(0,11,14)){try{DnsWire.name(query().copyOf(n));fail()}catch(_:IllegalArgumentException){}};try{DnsWire.validateReply(query(),reply(query()).apply{this[0]=0});fail()}catch(_:IllegalArgumentException){}}
 @Test fun forwardsUdpWithoutAlteringNxDomain() = verifyUdpExchange(DatagramSocket(InetSocketAddress("127.0.0.1", 0)))

 @Test fun forwardsUdpThroughIpv6Loopback() {
  val server = try {
   DatagramSocket(InetSocketAddress("::1", 0))
  } catch (unsupported: SocketException) {
   assumeNoException("IPv6 loopback is unavailable", unsupported)
   return
  }
  verifyUdpExchange(server)
 }

 private fun verifyUdpExchange(server: DatagramSocket) {
  server.soTimeout = 2000
  val pool = Executors.newSingleThreadExecutor()
  try {
   val answer = pool.submit {
    val request = DatagramPacket(ByteArray(4096), 4096)
    server.receive(request)
    val response = reply(request.data.copyOf(request.length))
    server.send(DatagramPacket(response, response.size, request.socketAddress))
   }
   val result = DnsForwarder(server.localSocketAddress as InetSocketAddress, { true }, { true }, 1000).exchange(query())
   assertArrayEquals(reply(query()), result)
   answer.get(2, TimeUnit.SECONDS)
  } finally {
   server.close()
   pool.shutdownNow()
  }
 }

 @Test fun unresponsiveResolverReturnsTimeout() {
  DatagramSocket(InetSocketAddress("127.0.0.1", 0)).use { server ->
   val forwarder = DnsForwarder(server.localSocketAddress as InetSocketAddress, { true }, { true }, 100)
   assertThrows(SocketTimeoutException::class.java) { forwarder.exchange(query()) }
  }
 }
 @Test fun truncatedUdpFallsBackToTcp(){
  val tcp=ServerSocket(0,1,InetAddress.getByName("127.0.0.1"));tcp.soTimeout=2000;val udp=DatagramSocket(InetSocketAddress("127.0.0.1",tcp.localPort));udp.soTimeout=2000;val pool=Executors.newFixedThreadPool(2)
  try{
   val u=pool.submit{val p=DatagramPacket(ByteArray(4096),4096);udp.receive(p);val r=reply(p.data.copyOf(p.length),true);udp.send(DatagramPacket(r,r.size,p.socketAddress))}
   val t=pool.submit{tcp.accept().use{s->s.soTimeout=2000;val input=DataInputStream(s.getInputStream());val q=ByteArray(input.readUnsignedShort());input.readFully(q);val r=reply(q);DataOutputStream(s.getOutputStream()).apply{writeShort(r.size);write(r);flush()}}}
   assertArrayEquals(reply(query()),DnsForwarder(InetSocketAddress("127.0.0.1",tcp.localPort),{true},{true},1000).exchange(query()));u.get(2,TimeUnit.SECONDS);t.get(2,TimeUnit.SECONDS)
  }finally{udp.close();tcp.close();pool.shutdownNow()}
 }
 @Test fun protectionFailureStopsBeforeSend(){try{DnsForwarder(InetSocketAddress("127.0.0.1",9),{false},{false},50).exchange(query());fail()}catch(_:IllegalStateException){}}
}
