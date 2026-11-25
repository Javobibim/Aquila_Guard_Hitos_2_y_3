package cl.aquilaguard.core

enum class DomainRisk(val score: Int) {
    NO_MATCH(0), SIGNALS(40), REPORTED(90)
}

data class DomainAssessment(val hostname: String, val risk: DomainRisk, val reasons: List<String>)

data class ThreatEntry(val hostname: String, val risk: DomainRisk, val recordedAtMillis: Long)
