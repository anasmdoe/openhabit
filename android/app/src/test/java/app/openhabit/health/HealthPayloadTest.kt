package app.openhabit.health

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class HealthPayloadTest {
    @Test
    fun buildsTheSyncBody() {
        val json = HealthPayload.toJson(
            listOf(
                DayMetrics("2026-11-06", steps = 9120, exerciseMinutes = 34.26, sleepHours = 7.456, distanceKm = 6.789, activeKcal = 412.4, waterMl = 1500.0),
                DayMetrics("2026-11-07", steps = 1200),
            ),
        )
        val days = JSONObject(json).getJSONArray("days")
        assertEquals(2, days.length())
        val m = days.getJSONObject(0).getJSONObject("metrics")
        assertEquals("2026-11-06", days.getJSONObject(0).getString("date"))
        assertEquals(9120, m.getLong("steps"))
        assertEquals(34.3, m.getDouble("exercise_minutes"), 0.0)
        assertEquals(7.46, m.getDouble("sleep_hours"), 0.0)
        assertEquals(6.79, m.getDouble("distance_km"), 0.0)
        assertEquals(412.0, m.getDouble("active_kcal"), 0.0)
        assertEquals(1, days.getJSONObject(1).getJSONObject("metrics").length())
    }

    @Test
    fun leavesOutEmptyDaysAndZeroes() {
        val json = HealthPayload.toJson(listOf(DayMetrics("2026-11-05"), DayMetrics("2026-11-06", steps = 0, sleepHours = 6.0)))
        val days = JSONObject(json).getJSONArray("days")
        assertEquals(1, days.length())
        assertFalse(days.getJSONObject(0).getJSONObject("metrics").has("steps"))
        assertFalse(DayMetrics("x", steps = 0).hasAny())
    }

    @Test
    fun capsSleepAt24Hours() {
        val m = JSONObject(HealthPayload.toJson(listOf(DayMetrics("2026-11-06", sleepHours = 30.0))))
            .getJSONArray("days").getJSONObject(0).getJSONObject("metrics")
        assertEquals(24.0, m.getDouble("sleep_hours"), 0.0)
    }
}
