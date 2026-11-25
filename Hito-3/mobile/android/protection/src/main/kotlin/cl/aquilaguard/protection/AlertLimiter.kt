package cl.aquilaguard.protection

import cl.aquilaguard.core.DomainAssessment
import cl.aquilaguard.core.DomainRisk

internal class AlertLimiter {
    private val recentAlerts = linkedMapOf<Pair<String, String>, Long>()

    fun allow(assessment: DomainAssessment, now: Long): Boolean {
        if (assessment.risk == DomainRisk.NO_MATCH) return false
        return allow(assessment.hostname to assessment.risk.name, now, 5_000)
    }

    fun allowLoginNotice(hostname: String, now: Long): Boolean =
        allow(hostname to "LOGIN_NOTICE", now, 5_000)

    private fun allow(key: Pair<String, String>, now: Long, intervalMillis: Long): Boolean {
        if (recentAlerts[key]?.let { now - it < intervalMillis } == true) return false
        recentAlerts.remove(key)
        recentAlerts[key] = now
        if (recentAlerts.size > 128) recentAlerts.remove(recentAlerts.keys.first())
        return true
    }
}
