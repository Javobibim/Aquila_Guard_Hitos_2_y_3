package cl.aquilaguard.protection

internal class BrowserAlertTest {
    private data class Request(val hostname: String, val expiresAt: Long)
    private var pending: Request? = null

    fun arm(hostname: String, now: Long): Boolean {
        if (hostname !in hosts) return false
        pending = Request(hostname, now + 30_000)
        return true
    }

    fun consume(hostname: String, now: Long): Boolean {
        val request = pending ?: return false
        if (now >= request.expiresAt) {
            clear()
            return false
        }
        if (hostname != request.hostname) return false
        clear()
        return true
    }

    fun isPending(hostname: String, now: Long): Boolean =
        pending?.let { it.hostname == hostname && now < it.expiresAt } == true

    fun clear() {
        pending = null
    }

    companion object {
        val hosts = listOf("example.org", "example.net")
    }
}
