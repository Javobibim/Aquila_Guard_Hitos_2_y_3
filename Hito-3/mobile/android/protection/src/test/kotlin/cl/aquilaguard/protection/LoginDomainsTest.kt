package cl.aquilaguard.protection

import cl.aquilaguard.core.DomainAssessment
import cl.aquilaguard.core.DomainRisk
import org.junit.Assert.*
import org.junit.Test

class LoginDomainsTest {
    @Test fun recognizesDedicatedHostsAndCommonSubdomains() {
        for (host in listOf(
            "accounts.google.com", "login.microsoftonline.com", "login.live.com",
            "appleid.apple.com", "sso.universidad.cl", "login.prueba-aquila.example"
        )) assertTrue(host, LoginDomains.matches(host))
        for (host in listOf("www.google.com", "universidad.cl", "mylogin.example", "cdn.login.example")) {
            assertFalse(host, LoginDomains.matches(host))
        }
    }

    @Test fun loginCooldownDoesNotSuppressRiskAlerts() {
        val limiter = AlertLimiter()
        val host = "login.example.com"
        assertTrue(limiter.allowLoginNotice(host, 0))
        assertFalse(limiter.allowLoginNotice(host, 4_999))
        assertTrue(limiter.allow(DomainAssessment(host, DomainRisk.REPORTED, emptyList()), 1))
        assertTrue(limiter.allowLoginNotice(host, 5_000))
    }
}
