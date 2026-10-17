package app.openhabit

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import app.openhabit.widget.Api
import app.openhabit.widget.HabitWidgetProvider
import app.openhabit.widget.Prefs
import kotlin.concurrent.thread

/**
 * The only screen: where to find your server and your personal API token (Account → API tokens in the web app).
 * Built in code to keep the project free of extra layout files and libraries.
 */
class MainActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
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

        col.addView(label("OpenHabit widget", 22f))
        col.addView(label("Connects the home-screen widget to your own OpenHabit server.", 13f, "#8B9690"))
        val url = field("https://habits.example.com", Prefs.baseUrl(this))
        val token = field("Personal API token", Prefs.token(this), secret = true)
        col.addView(label("Server address")); col.addView(url)
        col.addView(label("API token")); col.addView(token)
        val status = label("", 13f, "#8B9690")
        val save = Button(this).apply { text = "Save and test" }
        save.setOnClickListener {
            Prefs.save(this, url.text.toString(), token.text.toString())
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
        col.addView(save, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        col.addView(status)
        col.addView(label("Create a token in the web app under Account → API tokens. It is stored only on this phone.", 12f, "#667570"))
        setContentView(ScrollView(this).apply { addView(col); setBackgroundColor(Color.parseColor("#0F1A14")) })
    }
}
