package app.openhabit.health

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.aggregate.AggregateMetric
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HydrationRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.time.TimeRangeFilter
import app.openhabit.core.Api
import app.openhabit.core.Prefs
import java.time.LocalDate
import java.time.Period
import org.json.JSONObject

/**
 * Reads daily totals from Health Connect and sends them to the server, which completes the habits that
 * name a metric (habit editor > Complete automatically). Only the metrics the user granted are read.
 */
object HealthSync {
    val PERMISSIONS: Set<String> = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(HydrationRecord::class),
    )

    /** Background reads (the hourly sync) need this extra permission where Health Connect offers it. */
    val BACKGROUND: String = HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND

    fun isAvailable(c: Context) = HealthConnectClient.getSdkStatus(c) == HealthConnectClient.SDK_AVAILABLE

    fun client(c: Context) = HealthConnectClient.getOrCreate(c)

    fun backgroundSupported(c: Context): Boolean =
        client(c).features.getFeatureStatus(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND) ==
            HealthConnectFeatures.FEATURE_STATUS_AVAILABLE

    /** Permissions to ask for: the data types, plus background reads when supported. */
    fun permissionsToRequest(c: Context): Set<String> = if (backgroundSupported(c)) PERMISSIONS + BACKGROUND else PERMISSIONS

    suspend fun granted(c: Context): Set<String> = client(c).permissionController.getGrantedPermissions()

    /** The last [days] days (today included), one [DayMetrics] each. */
    suspend fun collect(c: Context, days: Int): List<DayMetrics> {
        val hc = client(c)
        val granted = granted(c)
        fun has(perm: String) = perm in granted
        val today = LocalDate.now()
        val first = today.minusDays((days - 1).toLong())

        val dayMetrics = buildSet<AggregateMetric<*>> {
            if (has(HealthPermission.getReadPermission(StepsRecord::class))) add(StepsRecord.COUNT_TOTAL)
            if (has(HealthPermission.getReadPermission(ExerciseSessionRecord::class))) add(ExerciseSessionRecord.EXERCISE_DURATION_TOTAL)
            if (has(HealthPermission.getReadPermission(DistanceRecord::class))) add(DistanceRecord.DISTANCE_TOTAL)
            if (has(HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class))) add(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL)
            if (has(HealthPermission.getReadPermission(HydrationRecord::class))) add(HydrationRecord.VOLUME_TOTAL)
        }
        val byDate = LinkedHashMap<String, DayMetrics>()
        for (i in 0 until days) first.plusDays(i.toLong()).toString().let { byDate[it] = DayMetrics(it) }

        if (dayMetrics.isNotEmpty()) {
            val groups = hc.aggregateGroupByPeriod(
                AggregateGroupByPeriodRequest(
                    metrics = dayMetrics,
                    timeRangeFilter = TimeRangeFilter.between(first.atStartOfDay(), today.plusDays(1).atStartOfDay()),
                    timeRangeSlicer = Period.ofDays(1),
                ),
            )
            for (g in groups) {
                val date = g.startTime.toLocalDate().toString()
                val r = g.result
                byDate[date] = (byDate[date] ?: DayMetrics(date)).copy(
                    steps = r[StepsRecord.COUNT_TOTAL],
                    exerciseMinutes = r[ExerciseSessionRecord.EXERCISE_DURATION_TOTAL]?.seconds?.div(60.0),
                    distanceKm = r[DistanceRecord.DISTANCE_TOTAL]?.inKilometers,
                    activeKcal = r[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories,
                    waterMl = r[HydrationRecord.VOLUME_TOTAL]?.inMilliliters,
                )
            }
        }

        // A night counts for the morning it ends on: day D is 18:00 the evening before until 18:00 on D.
        if (has(HealthPermission.getReadPermission(SleepSessionRecord::class))) {
            val nights = hc.aggregateGroupByPeriod(
                AggregateGroupByPeriodRequest(
                    metrics = setOf(SleepSessionRecord.SLEEP_DURATION_TOTAL),
                    timeRangeFilter = TimeRangeFilter.between(
                        first.minusDays(1).atTime(18, 0), today.atTime(18, 0),
                    ),
                    timeRangeSlicer = Period.ofDays(1),
                ),
            )
            for (g in nights) {
                val date = g.startTime.toLocalDate().plusDays(1).toString()
                val secs = g.result[SleepSessionRecord.SLEEP_DURATION_TOTAL]?.seconds ?: continue
                byDate[date]?.let { byDate[date] = it.copy(sleepHours = secs / 3600.0) }
            }
        }
        return byDate.values.toList()
    }

    data class Result(val sentDays: Int, val applied: Int)

    /** Reads [days] days and sends them. Throws when Health Connect or the server can't be reached. */
    suspend fun sync(c: Context, days: Int = 7): Result {
        if (!Prefs.isConfigured(c)) return Result(0, 0)
        val metrics = collect(c, days)
        val body = HealthPayload.toJson(metrics)
        val sent = HealthPayload.dayCount(body)
        if (sent == 0) return Result(0, 0)
        val response = Api.healthSync(c, body)
        val applied = JSONObject(response).optJSONArray("applied")?.length() ?: 0
        c.getSharedPreferences("openhabit", Context.MODE_PRIVATE).edit()
            .putLong("healthLastSync", System.currentTimeMillis()).apply()
        return Result(sent, applied)
    }

    fun lastSync(c: Context): Long = c.getSharedPreferences("openhabit", Context.MODE_PRIVATE).getLong("healthLastSync", 0)
}
