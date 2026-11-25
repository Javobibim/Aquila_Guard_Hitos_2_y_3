package cl.aquilaguard.data

import android.content.Context
import cl.aquilaguard.detection.DomainEvaluator
import org.json.JSONObject

object ThreatRepository {
    data class Loaded(val evaluator: DomainEvaluator, val count:Int, val fetchedAt:String)
    private var cached: Loaded? = null

    @Synchronized
    fun load(context: Context): Loaded = cached ?: readAssets(context).also { cached = it }

    private fun readAssets(context: Context):Loaded {
        val data=JSONObject(context.assets.open("reputation.json").bufferedReader().use{it.readText()})
        require(data.getInt("format")==1 && data.getString("source")=="PhishDestroy primary")
        val array=data.getJSONArray("domains");require(array.length() in 1..1_000_000)
        val reports=HashSet<String>(array.length());for(i in 0 until array.length())reports.add(array.getString(i))
        val suffixes=context.assets.open("public_suffix_list.dat").bufferedReader().useLines{lines->lines.map{it.trim()}.filter{it.isNotEmpty()&&!it.startsWith("//")}.toSet()}
        val config=JSONObject(context.assets.open("domain-rules.json").bufferedReader().use{it.readText()}).getJSONArray("brands")
        val brands=List(config.length()){i->
            val b=config.getJSONObject(i)
            fun strings(key:String):List<String> {
                val a=b.getJSONArray(key)
                return List(a.length()){a.getString(it)}
            }
            DomainEvaluator.Brand(b.getString("name"),strings("tokens"),strings("domains"))
        }
        return Loaded(DomainEvaluator(reports,suffixes,brands),reports.size,data.getString("fetchedAt"))
    }
}
