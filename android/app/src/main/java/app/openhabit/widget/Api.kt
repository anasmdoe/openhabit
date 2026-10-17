package app.openhabit.widget

import android.content.Context
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDate

class ApiException(val status: Int, message: String) : Exception(message)

/** The three calls the widget needs. Blocking: call from a background thread only. */
object Api {
    private const val TIMEOUT_MS = 10_000

    fun today(c: Context): Today {
        val date = LocalDate.now().toString() // the phone's own calendar day
        return TodayParser.parse(request(c, "GET", "/api/v1/analytics/today?today=$date", null))
    }

    fun setValue(c: Context, habitId: String, date: String, value: Double) {
        val body = """{"habitId":"$habitId","date":"$date","value":$value}"""
        request(c, "PUT", "/api/v1/entries", body)
    }

    fun clear(c: Context, habitId: String, date: String) {
        request(c, "DELETE", "/api/v1/entries/$habitId/$date", null)
    }

    private fun request(c: Context, method: String, path: String, body: String?): String {
        val conn = URL(Prefs.baseUrl(c) + path).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = method
            conn.connectTimeout = TIMEOUT_MS
            conn.readTimeout = TIMEOUT_MS
            conn.setRequestProperty("Authorization", "Bearer ${Prefs.token(c)}")
            conn.setRequestProperty("Accept", "application/json")
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.outputStream.use { it.write(body.toByteArray()) }
            }
            val status = conn.responseCode
            val stream = if (status in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
            if (status !in 200..299) throw ApiException(status, text.take(200))
            return text
        } finally {
            conn.disconnect()
        }
    }
}
