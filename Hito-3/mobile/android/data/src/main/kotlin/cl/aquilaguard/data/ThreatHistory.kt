package cl.aquilaguard.data

import android.content.Context
import cl.aquilaguard.core.DomainAssessment
import cl.aquilaguard.core.DomainRisk
import cl.aquilaguard.core.ThreatEntry
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

enum class HistoryRetention(val days: Int) { OFF(0), WEEK(7), MONTH(30) }

class ThreatHistory(context: Context) {
    private val preferences = context.getSharedPreferences("threat_history", Context.MODE_PRIVATE)

    val retention: HistoryRetention
        get() = HistoryRetention.entries.firstOrNull { it.days == preferences.getInt("days", 0) }
            ?: HistoryRetention.OFF

    fun setRetention(value: HistoryRetention) {
        val editor = preferences.edit().putInt("days", value.days)
        if (value == HistoryRetention.OFF) editor.remove("entries")
        editor.apply()
        entries()
    }

    fun entries(): List<ThreatEntry> {
        val days = retention.days
        if (days == 0) return emptyList()
        val stored = preferences.getString("entries", null) ?: return emptyList()
        val entries = runCatching { JSONArray(stored) }.getOrElse {
            clear()
            return emptyList()
        }
        val cutoff = System.currentTimeMillis() - TimeUnit.DAYS.toMillis(days.toLong())
        val retained = buildList {
            for (index in 0 until entries.length()) {
                val item = entries.optJSONObject(index) ?: continue
                val recordedAt = item.optLong("at")
                val risk = DomainRisk.entries.firstOrNull { it.name == item.optString("risk") } ?: continue
                val host = item.optString("host")
                if (recordedAt >= cutoff && host.isNotEmpty() && risk != DomainRisk.NO_MATCH) {
                    add(ThreatEntry(host, risk, recordedAt))
                }
                if (size == MAX_ENTRIES) break
            }
        }
        if (retained.size != entries.length()) write(retained)
        return retained
    }

    fun record(assessment: DomainAssessment) {
        if (retention == HistoryRetention.OFF || assessment.risk == DomainRisk.NO_MATCH) return
        val entry = ThreatEntry(assessment.hostname, assessment.risk, System.currentTimeMillis())
        write((listOf(entry) + entries().filterNot { it.hostname == entry.hostname }).take(MAX_ENTRIES))
    }

    fun clear() { preferences.edit().remove("entries").apply() }

    private fun write(entries: List<ThreatEntry>) {
        val array = JSONArray()
        for (entry in entries) {
            array.put(JSONObject().put("host", entry.hostname).put("risk", entry.risk.name).put("at", entry.recordedAtMillis))
        }
        preferences.edit().putString("entries", array.toString()).apply()
    }

    private companion object { const val MAX_ENTRIES = 100 }
}
