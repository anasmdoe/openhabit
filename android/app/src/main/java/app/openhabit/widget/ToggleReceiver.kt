package app.openhabit.widget

import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.Toast
import app.openhabit.R
import java.time.LocalDate
import kotlin.concurrent.thread

/** A tap on a widget row: check the habit off (or undo it), then refresh the list. */
class ToggleReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val habitId = intent.getStringExtra(EXTRA_HABIT_ID) ?: return
        val completed = intent.getBooleanExtra(EXTRA_COMPLETED, false)
        val value = intent.getDoubleExtra(EXTRA_VALUE, Double.NaN)
        val app = context.applicationContext
        val pending = goAsync()
        val today = LocalDate.now().toString()

        // Show the result straight away; the network call confirms it a moment later.
        optimistic(habitId, completed)
        notifyList(app)

        thread {
            try {
                if (completed) Api.clear(app, habitId, today) else if (!value.isNaN()) Api.setValue(app, habitId, today, value)
            } catch (e: Exception) {
                optimistic(habitId, !completed) // put it back
                notifyList(app)
                android.os.Handler(android.os.Looper.getMainLooper()).post {
                    Toast.makeText(app, "Could not save: ${e.message ?: "offline"}", Toast.LENGTH_SHORT).show()
                }
            } finally {
                HabitWidgetProvider.refresh(app) { pending.finish() }
            }
        }
    }

    private fun optimistic(habitId: String, nowCompleted: Boolean) {
        val t = HabitWidgetService.cache ?: return
        val habits = t.habits.map { if (it.id == habitId) it.copy(completed = !nowCompleted) else it }
        HabitWidgetService.cache = t.copy(habits = habits, done = habits.count { it.completed })
    }

    private fun notifyList(app: Context) {
        val mgr = AppWidgetManager.getInstance(app)
        val ids = mgr.getAppWidgetIds(ComponentName(app, HabitWidgetProvider::class.java))
        mgr.notifyAppWidgetViewDataChanged(ids, R.id.widget_list)
    }

    companion object {
        const val EXTRA_HABIT_ID = "habitId"
        const val EXTRA_COMPLETED = "completed"
        const val EXTRA_VALUE = "value"
        fun valueOrNaN(v: Double?) = v ?: Double.NaN
    }
}
