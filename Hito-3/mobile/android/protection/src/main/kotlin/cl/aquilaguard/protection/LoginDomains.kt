package cl.aquilaguard.protection

internal object LoginDomains {
    private val knownHosts = setOf(
        "accounts.google.com",
        "login.microsoftonline.com",
        "login.live.com",
        "appleid.apple.com"
    )
    private val accessLabels = setOf("login", "signin", "sign-in", "accounts", "sso", "auth")

    fun matches(hostname: String): Boolean =
        hostname in knownHosts ||
            (hostname.count { it == '.' } >= 2 && hostname.substringBefore('.') in accessLabels)
}
