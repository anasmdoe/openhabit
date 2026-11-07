package app.openhabit.health

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import app.openhabit.widget.HabitWidgetProvider
import java.util.concurrent.TimeUnit

/** Hourly sync in the background (one small request per hour), then a widget refresh. */
class HealthSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result = try {
        if (!HealthSync.isAvailable(applicationContext)) {
            Result.success()
        } else {
            val r = HealthSync.sync(applicationContext, days = 3)
            if (r.applied > 0) HabitWidgetProvider.refresh(applicationContext)
            Result.success()
        }
    } catch (e: SecurityException) {
        Result.success() // permission withdrawn: nothing to do until the user grants it again
    } catch (e: Exception) {
        Result.retry()
    }

    companion object {
        private const val NAME = "openhabit-health-sync"

        fun schedule(c: Context) {
            val req = PeriodicWorkRequestBuilder<HealthSyncWorker>(1, TimeUnit.HOURS)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(c).enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.KEEP, req)
        }

        fun cancel(c: Context) = WorkManager.getInstance(c).cancelUniqueWork(NAME)
    }
}
