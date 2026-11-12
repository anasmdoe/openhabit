package app.openhabit.wear

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import app.openhabit.core.Api
import app.openhabit.core.Prefs
import app.openhabit.core.Today
import app.openhabit.core.TodayParser
import java.time.LocalDate
import kotlin.concurrent.thread

/** Today's habits on the watch; tap one to check it off (or undo it). Settings come from the phone app. */
class WearActivity : Activity() {
    private lateinit var list: LinearLayout
    private lateinit var header: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (14 * resources.displayMetrics.density).toInt()
        list = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(pad, pad * 2, pad, pad * 3) // round screens: keep rows off the edges
        }
        header = TextView(this).apply {
            textSize = 15f; setTextColor(Color.parseColor("#6EE7B7")); gravity = Gravity.CENTER; setPadding(0, 0, 0, pad / 2)
        }
        list.addView(header)
        setContentView(ScrollView(this).apply { addView(list); setBackgroundColor(Color.BLACK) })
    }

    override fun onResume() {
        super.onResume()
        load()
    }

    private fun load() {
        if (!Prefs.isConfigured(this)) {
            header.text = "Open OpenHabit on your phone and press Save to connect the watch."
            return
        }
        header.text = "Loading…"
        thread {
            val t = runCatching { Api.today(applicationContext) }
            runOnUiThread { t.onSuccess { render(it) }.onFailure { header.text = "Offline" } }
        }
    }

    private fun render(t: Today) {
        while (list.childCount > 1) list.removeViewAt(1)
        header.text = if (t.total == 0) "Nothing due today" else "${t.done}/${t.total} done"
        for (h in t.habits) {
            val b = Button(this).apply {
                text = (if (h.completed) "✓ " else if (h.skipped) "– " else "") + h.name
                isAllCaps = false
                setTextColor(if (h.completed || h.skipped) Color.parseColor("#8B9690") else Color.WHITE)
                setOnClickListener {
                    isEnabled = false
                    thread {
                        val date = LocalDate.now().toString()
                        runCatching {
                            val v = TodayParser.valueToWrite(h)
                            if (v == null) Api.clear(applicationContext, h.id, date) else Api.setValue(applicationContext, h.id, date, v)
                        }
                        ProgressComplicationService.requestUpdate(applicationContext)
                        runOnUiThread { load() }
                    }
                }
            }
            list.addView(b, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        }
    }
}
