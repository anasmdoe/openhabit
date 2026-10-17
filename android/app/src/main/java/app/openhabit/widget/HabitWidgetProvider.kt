package app.openhabit.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import app.openhabit.MainActivity
import app.openhabit.R
import kotlin.concurrent.thread

class HabitWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        for (id in ids) manager.updateAppWidget(id, build(context, id, headline = null))
    }

    override fun onReceive(context: Context, intent: Intent) {
        // goAsync keeps the process alive until the network call below has finished
        val pending = goAsync()
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH || intent.action == AppWidgetManager.ACTION_APPWIDGET_UPDATE) {
            refresh(context) { pending.finish() }
        } else {
            pending.finish()
        }
    }

    companion object {
        const val ACTION_REFRESH = "app.openhabit.widget.REFRESH"
        const val ACTION_TOGGLE = "app.openhabit.widget.TOGGLE"

        /** Fetches today's habits off the main thread, then redraws every widget with the new count. */
        fun refresh(context: Context, finished: () -> Unit = {}) {
            val app = context.applicationContext
            thread {
                var headline: String? = null
                try {
                    if (Prefs.isConfigured(app)) {
                        val t = Api.today(app)
                        HabitWidgetService.cache = t
                        headline = "${t.done}/${t.total}"
                    }
                } catch (e: Exception) {
                    headline = "offline"
                }
                val mgr = AppWidgetManager.getInstance(app)
                val ids = mgr.getAppWidgetIds(ComponentName(app, HabitWidgetProvider::class.java))
                for (id in ids) mgr.updateAppWidget(id, build(app, id, headline))
                mgr.notifyAppWidgetViewDataChanged(ids, R.id.widget_list)
                finished()
            }
        }

        fun build(context: Context, widgetId: Int, headline: String?): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_habits)
            val configured = Prefs.isConfigured(context)
            views.setTextViewText(R.id.widget_progress, headline ?: HabitWidgetService.cache?.let { "${it.done}/${it.total}" } ?: "")
            views.setTextViewText(R.id.widget_empty, context.getString(if (configured) R.string.widget_empty else R.string.widget_setup))

            val adapterIntent = Intent(context, HabitWidgetService::class.java).apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
                data = Uri.parse(toUri(Intent.URI_INTENT_SCHEME)) // unique per widget so the system keeps the factories apart
            }
            views.setRemoteAdapter(R.id.widget_list, adapterIntent)
            views.setEmptyView(R.id.widget_list, R.id.widget_empty)

            // Tapping a row fires a broadcast; each row fills in which habit it is.
            val toggle = Intent(context, ToggleReceiver::class.java).setAction(ACTION_TOGGLE)
            views.setPendingIntentTemplate(
                R.id.widget_list,
                PendingIntent.getBroadcast(context, 0, toggle, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE),
            )

            val refresh = Intent(context, HabitWidgetProvider::class.java).setAction(ACTION_REFRESH)
            views.setOnClickPendingIntent(
                R.id.widget_refresh,
                PendingIntent.getBroadcast(context, 1, refresh, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE),
            )
            val open = Intent(context, MainActivity::class.java)
            views.setOnClickPendingIntent(
                R.id.widget_title,
                PendingIntent.getActivity(context, 2, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE),
            )
            views.setViewVisibility(R.id.widget_list, View.VISIBLE)
            return views
        }
    }
}
