package app.openhabit

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.text.InputType
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.lifecycleScope
import app.openhabit.core.Api
import app.openhabit.core.Prefs
import app.openhabit.health.HealthSync
import app.openhabit.health.HealthSyncWorker
import app.openhabit.wear.WearConfig
import app.openhabit.widget.HabitWidgetProvider
import java.text.DateFormat
import java.util.Date
import kotlin.concurrent.thread
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * The only screen: where to find your server and your personal API token (Account → API tokens in the web
 * app), and the Health Connect connection that completes habits automatically. Built in code to keep the
 * project free of extra layout files and UI libraries. Also opened by Health Connect to show why the app
 * asks for health data (ACTION_SHOW_PERMISSIONS_RATIONALE / VIEW_PERMISSION_USAGE).
 */
class MainActivity : ComponentActivity() {

    private lateinit var healthStatus: TextView
    private lateinit var requestHealth: ActivityResultLauncher<Set<String>>

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestHealth = registerForActivityResult(PermissionController.createRequestPermissionResultContract()) { granted ->
            if (granted.any { it in HealthSync.PERMISSIONS }) {
                HealthSyncWorker.schedule(applicationContext)
                syncNow(days = 30) // the first sync fills the last month
            } else {
                refreshHealthStatus()
            }
        }

        val pad = (20 * resources.displayMetrics.density).toInt()
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad * 2, pad, pad)
            setBackgroundColor(Color.parseColor("#0F1A14"))
        }
        fun label(t: String, size: Float = 14f, color: String = "#E6EDE9") = TextView(this).apply {
            text = t; textSize = size; setTextColor(Color.parseColor(color)); setPadding(0, pad / 2, 0, pad / 4)
        }
        fun field(hint: String, value: String, secret: Boolean = false) = EditText(this).apply {
            this.hint = hint; setText(value); setTextColor(Color.WHITE); setHintTextColor(Color.parseColor("#667570"))
            inputType = if (secret) InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD else InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setSingleLine()
        }
        fun button(t: String) = Button(this).apply { text = t }
        val full = ViewGroup.LayoutParams.MATCH_PARENT
        val wrap = ViewGroup.LayoutParams.WRAP_CONTENT

        if (intent?.action == "androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" || intent?.action == Intent.ACTION_VIEW_PERMISSION_USAGE) {
            col.addView(label("Why OpenHabit reads health data", 18f))
            col.addView(label(getString(R.string.health_rationale), 13f, "#8B9690"))
        }

        col.addView(label("OpenHabit", 22f))
        col.addView(label("Connects the widget, the watch and Health Connect to your own OpenHabit server.", 13f, "#8B9690"))
        val url = field("https://habits.example.com", Prefs.baseUrl(this))
        val token = field("Personal API token", Prefs.token(this), secret = true)
        col.addView(label("Server address")); col.addView(url)
        col.addView(label("API token")); col.addView(token)
        val status = label("", 13f, "#8B9690")
        val save = button("Save and test")
        save.setOnClickListener {
            Prefs.save(this, url.text.toString(), token.text.toString())
            WearConfig.send(applicationContext) // the watch app gets the same server and token
            status.text = "Checking…"
            thread {
                val msg = try {
                    val t = Api.today(applicationContext)
                    "Connected: ${t.done} of ${t.total} habits done today. Now add the OpenHabit widget to your home screen."
                } catch (e: Exception) {
                    "Could not connect: ${e.message ?: e.javaClass.simpleName}"
                }
                runOnUiThread { status.text = msg }
                HabitWidgetProvider.refresh(applicationContext)
            }
        }
        col.addView(save, full, wrap)
        col.addView(status)
        col.addView(label("Create a token in the web app under Account → API tokens. It is stored only on this phone (and your watch).", 12f, "#667570"))

        col.addView(label("Health Connect", 18f))
        col.addView(label("Steps, exercise, sleep, distance, active energy and water complete the habits you set to “Complete automatically” in the web app. Sleep also fills the Patterns panel.", 13f, "#8B9690"))
        healthStatus = label("", 13f, "#8B9690")
        val connect = button("Connect Health Connect")
        connect.setOnClickListener {
            if (!HealthSync.isAvailable(this)) {
                healthStatus.text = "Health Connect isn't available on this phone. On Android 13 and older, install it from Google Play."
            } else {
                requestHealth.launch(HealthSync.permissionsToRequest(this))
            }
        }
        val syncButton = button("Sync now")
        syncButton.setOnClickListener { syncNow(days = 7) }
        col.addView(connect, full, wrap)
        col.addView(syncButton, full, wrap)
        col.addView(healthStatus)
        setContentView(ScrollView(this).apply { addView(col); setBackgroundColor(Color.parseColor("#0F1A14")) })
        refreshHealthStatus()
    }

    private fun refreshHealthStatus() {
        if (!HealthSync.isAvailable(this)) {
            healthStatus.text = "Health Connect: not available on this phone."
            return
        }
        lifecycleScope.launch {
            val granted = runCatching { HealthSync.granted(applicationContext) }.getOrDefault(emptySet())
            val n = granted.count { it in HealthSync.PERMISSIONS }
            val last = HealthSync.lastSync(applicationContext)
            healthStatus.text = when {
                n == 0 -> "Health Connect: not connected."
                else -> "Health Connect: $n of ${HealthSync.PERMISSIONS.size} data types allowed" +
                    (if (HealthSync.BACKGROUND in granted) ", syncs every hour" else ", syncs when you open the app") +
                    (if (last > 0) ". Last sync ${DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(last))}." else ".")
            }
            if (n > 0 && HealthSync.BACKGROUND !in granted) syncNow(days = 3, quiet = true)
        }
    }

    private fun syncNow(days: Int, quiet: Boolean = false) {
        if (!quiet) healthStatus.text = "Syncing…"
        lifecycleScope.launch {
            val msg = try {
                val r = withContext(Dispatchers.IO) { HealthSync.sync(applicationContext, days) }
                HabitWidgetProvider.refresh(applicationContext)
                if (!Prefs.isConfigured(applicationContext)) "Save your server and token first."
                else "Sent ${r.sentDays} day(s); ${r.applied} habit check-in(s) updated."
            } catch (e: Exception) {
                "Sync failed: ${e.message ?: e.javaClass.simpleName}"
            }
            if (!quiet) healthStatus.text = msg
        }
    }
}
