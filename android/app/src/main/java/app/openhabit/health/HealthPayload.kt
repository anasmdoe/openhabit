package app.openhabit.health

import org.json.JSONArray
import org.json.JSONObject

/** One day's totals read from Health Connect. null = no data or no permission for that metric. */
data class DayMetrics(
    val date: String,
    val steps: Long? = null,
    val exerciseMinutes: Double? = null,
    val sleepHours: Double? = null,
    val distanceKm: Double? = null,
    val activeKcal: Double? = null,
    val waterMl: Double? = null,
) {
    fun hasAny() = listOf(steps, exerciseMinutes, sleepHours, distanceKm, activeKcal, waterMl).any { it != null && it.toDouble() > 0.0 }
}

/** Builds the body of POST /api/v1/wellness/health-sync. Pure, so it is unit-tested on the JVM. */
object HealthPayload {
    fun toJson(days: List<DayMetrics>): String {
        val arr = JSONArray()
        for (d in days.filter { it.hasAny() }) {
            val m = JSONObject()
            d.steps?.takeIf { it > 0 }?.let { m.put("steps", it) }
            d.exerciseMinutes?.takeIf { it > 0 }?.let { m.put("exercise_minutes", round(it, 1)) }
            d.sleepHours?.takeIf { it > 0 }?.let { m.put("sleep_hours", round(it.coerceAtMost(24.0), 2)) }
            d.distanceKm?.takeIf { it > 0 }?.let { m.put("distance_km", round(it, 2)) }
            d.activeKcal?.takeIf { it > 0 }?.let { m.put("active_kcal", round(it, 0)) }
            d.waterMl?.takeIf { it > 0 }?.let { m.put("water_ml", round(it, 0)) }
            arr.put(JSONObject().put("date", d.date).put("metrics", m))
        }
        return JSONObject().put("days", arr).toString()
    }

    /** Number of days the server actually received data for (the response's "days"). */
    fun dayCount(json: String): Int = JSONObject(json).getJSONArray("days").length()

    private fun round(v: Double, places: Int): Double {
        var f = 1.0
        repeat(places) { f *= 10 }
        return Math.round(v * f) / f
    }
}
