package app.openhabit.widget

import org.json.JSONObject

/** One habit due today, as returned by GET /api/v1/analytics/today. */
data class TodayHabit(
    val id: String,
    val name: String,
    val color: String,
    val isNumeric: Boolean,
    val unit: String,
    val target: Double,
    val value: Double?,
    val completed: Boolean,
    val skipped: Boolean,
    val streak: Int,
    val afterHabitId: String?,
)

data class Today(val date: String, val done: Int, val total: Int, val habits: List<TodayHabit>)

/** Pure parsing and ordering, kept free of Android classes so it runs as a plain JVM unit test. */
object TodayParser {
    fun parse(json: String): Today {
        val root = JSONObject(json)
        val arr = root.getJSONArray("habits")
        val list = ArrayList<TodayHabit>(arr.length())
        for (i in 0 until arr.length()) {
            val h = arr.getJSONObject(i)
            list.add(
                TodayHabit(
                    id = h.getString("id"),
                    name = h.getString("name"),
                    color = h.optString("color", "#6EE7B7"),
                    isNumeric = h.optString("type") == "numeric",
                    unit = h.optString("unit", ""),
                    target = h.optDouble("target", 1.0),
                    value = if (h.isNull("value")) null else h.getDouble("value"),
                    completed = h.optBoolean("completed"),
                    skipped = h.optBoolean("skipped"),
                    streak = h.optInt("streak"),
                    afterHabitId = if (h.isNull("afterHabitId")) null else h.optString("afterHabitId"),
                ),
            )
        }
        return Today(
            date = root.getString("date"),
            done = root.optInt("done"),
            total = root.optInt("total", list.size),
            habits = stackOrder(list),
        )
    }

    /** A habit stacked "after" another sits directly behind it; everything else keeps the server's order. */
    fun stackOrder(list: List<TodayHabit>): List<TodayHabit> {
        val ids = list.map { it.id }.toSet()
        val followers = HashMap<String, MutableList<TodayHabit>>()
        val roots = ArrayList<TodayHabit>()
        for (h in list) {
            val a = h.afterHabitId
            if (a != null && a != h.id && a in ids) followers.getOrPut(a) { ArrayList() }.add(h) else roots.add(h)
        }
        val out = ArrayList<TodayHabit>(list.size)
        val seen = HashSet<String>()
        fun visit(h: TodayHabit) {
            if (!seen.add(h.id)) return
            out.add(h)
            followers[h.id]?.forEach { visit(it) }
        }
        roots.forEach { visit(it) }
        list.forEach { visit(it) } // never drop a habit, even if the data holds a loop
        return out
    }

    /** What a tap on a row should write: nothing is toggled off by deleting, a numeric habit goes straight to its target. */
    fun valueToWrite(h: TodayHabit): Double? =
        if (h.completed) null else if (h.isNumeric) h.target else 1.0
}
