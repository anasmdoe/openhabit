package app.openhabit.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import app.openhabit.R

/** Supplies the rows of the widget's list from the last fetched [Today]. */
class HabitWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory = Factory(applicationContext)

    private class Factory(private val context: Context) : RemoteViewsFactory {
        private var habits: List<TodayHabit> = emptyList()

        override fun onCreate() {}
        override fun onDataSetChanged() {
            habits = cache?.habits ?: emptyList()
        }
        override fun onDestroy() {}
        override fun getCount() = habits.size
        override fun getViewTypeCount() = 1
        override fun hasStableIds() = true
        override fun getLoadingView(): RemoteViews? = null
        override fun getItemId(position: Int) = habits.getOrNull(position)?.id?.hashCode()?.toLong() ?: position.toLong()

        override fun getViewAt(position: Int): RemoteViews {
            val h = habits[position]
            val row = RemoteViews(context.packageName, R.layout.widget_row)
            val color = parseColor(h.color)
            val stacked = h.afterHabitId != null
            row.setTextViewText(R.id.row_name, (if (stacked) "↳ " else "") + h.name)
            row.setTextViewText(R.id.row_check, if (h.completed) "✓" else if (h.skipped) "–" else "")
            row.setInt(R.id.row_check, "setBackgroundColor", if (h.completed) color else 0x33FFFFFF)
            row.setTextColor(R.id.row_name, if (h.completed || h.skipped) 0xFF8B9690.toInt() else 0xFFE6EDE9.toInt())
            row.setTextViewText(R.id.row_meta, meta(h))

            val fill = Intent()
                .putExtra(ToggleReceiver.EXTRA_HABIT_ID, h.id)
                .putExtra(ToggleReceiver.EXTRA_COMPLETED, h.completed)
                .putExtra(ToggleReceiver.EXTRA_VALUE, ToggleReceiver.valueOrNaN(TodayParser.valueToWrite(h)))
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, 0)
            row.setOnClickFillInIntent(R.id.row_root, fill)
            return row
        }

        private fun meta(h: TodayHabit): String = when {
            h.isNumeric && h.value != null && !h.completed -> "${trim(h.value)}/${trim(h.target)} ${h.unit}".trim()
            h.isNumeric && !h.completed -> "${trim(h.target)} ${h.unit}".trim()
            h.streak >= 2 -> "🔥 ${h.streak}"
            else -> ""
        }

        private fun trim(d: Double) = if (d == Math.floor(d)) d.toLong().toString() else d.toString()

        private fun parseColor(hex: String): Int = try {
            Color.parseColor(hex)
        } catch (e: IllegalArgumentException) {
            0xFF6EE7B7.toInt()
        }
    }

    companion object {
        /** The last successful fetch, shared with the provider in this process. */
        @Volatile var cache: Today? = null
    }
}
