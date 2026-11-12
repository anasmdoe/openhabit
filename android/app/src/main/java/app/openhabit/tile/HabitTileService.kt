package app.openhabit.tile

import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import app.openhabit.core.Api
import app.openhabit.core.Prefs
import app.openhabit.core.TodayParser
import app.openhabit.widget.HabitWidgetProvider
import app.openhabit.widget.HabitWidgetService
import java.time.LocalDate
import kotlin.concurrent.thread

/**
 * A Quick Settings tile, reachable from the lock screen: shows "3/7 habits" and the next open habit,
 * and a tap checks that habit off. A second tap on the same tile moves on to the next one.
 */
class HabitTileService : TileService() {

    override fun onStartListening() {
        super.onStartListening()
        if (!Prefs.isConfigured(this)) {
            show("OpenHabit", "Set up in the app", Tile.STATE_INACTIVE)
            return
        }
        thread {
            runCatching { Api.today(applicationContext) }.onSuccess { HabitWidgetService.cache = it }
            render()
        }
    }

    override fun onClick() {
        super.onClick()
        val today = HabitWidgetService.cache ?: return
        val next = today.habits.firstOrNull { !it.completed && !it.skipped } ?: return
        val value = TodayParser.valueToWrite(next) ?: return
        thread {
            val ok = runCatching { Api.setValue(applicationContext, next.id, LocalDate.now().toString(), value) }.isSuccess
            if (ok) {
                runCatching { Api.today(applicationContext) }.onSuccess { HabitWidgetService.cache = it }
                HabitWidgetProvider.refresh(applicationContext)
            }
            render()
        }
    }

    private fun render() {
        val t = HabitWidgetService.cache
        if (t == null) {
            show("OpenHabit", "Offline", Tile.STATE_INACTIVE)
            return
        }
        val next = t.habits.firstOrNull { !it.completed && !it.skipped }
        show("${t.done}/${t.total} habits", next?.let { "Tap: ${it.name}" } ?: "All done", if (next == null) Tile.STATE_INACTIVE else Tile.STATE_ACTIVE)
    }

    private fun show(label: String, subtitle: String, state: Int) {
        val tile = qsTile ?: return
        tile.label = label
        if (android.os.Build.VERSION.SDK_INT >= 29) tile.subtitle = subtitle
        tile.state = state
        tile.updateTile()
    }
}
