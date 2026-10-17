package app.openhabit.widget

import android.content.Context

/** Server address and personal API token, kept in private app preferences. */
object Prefs {
    private const val FILE = "openhabit"

    fun baseUrl(c: Context): String = c.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString("baseUrl", "") ?: ""
    fun token(c: Context): String = c.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString("token", "") ?: ""

    fun save(c: Context, baseUrl: String, token: String) {
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit()
            .putString("baseUrl", normalize(baseUrl))
            .putString("token", token.trim())
            .apply()
    }

    fun isConfigured(c: Context) = baseUrl(c).isNotEmpty() && token(c).isNotEmpty()

    /** "https://habits.example.com/" and "habits.example.com" both become "https://habits.example.com". */
    fun normalize(raw: String): String {
        var s = raw.trim().trimEnd('/')
        if (s.isEmpty()) return ""
        if (!s.startsWith("http://") && !s.startsWith("https://")) s = "https://$s"
        return s
    }
}
