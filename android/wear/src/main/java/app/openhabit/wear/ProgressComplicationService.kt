package app.openhabit.wear

import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.RangedValueComplicationData
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService
import app.openhabit.core.Api
import app.openhabit.core.Prefs
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Today's progress as a watch-face complication: a ring (ranged value) or short text "3/7". */
class ProgressComplicationService : SuspendingComplicationDataSourceService() {

    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
        if (!Prefs.isConfigured(this)) return build(request.complicationType, 0, 0, "—")
        val today = runCatching { withContext(Dispatchers.IO) { Api.today(applicationContext) } }.getOrNull()
            ?: return build(request.complicationType, 0, 0, "—")
        return build(request.complicationType, today.done, today.total, "${today.done}/${today.total}")
    }

    override fun getPreviewData(type: ComplicationType): ComplicationData? = build(type, 3, 7, "3/7")

    private fun build(type: ComplicationType, done: Int, total: Int, label: String): ComplicationData? {
        val text = PlainComplicationText.Builder(label).build()
        val description = PlainComplicationText.Builder("$done of $total habits done today").build()
        val tap = PendingIntent.getActivity(this, 0, Intent(this, WearActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        return when (type) {
            ComplicationType.RANGED_VALUE -> RangedValueComplicationData.Builder(
                value = done.toFloat(), min = 0f, max = total.coerceAtLeast(1).toFloat(), contentDescription = description,
            ).setText(text).setTapAction(tap).build()
            ComplicationType.SHORT_TEXT -> ShortTextComplicationData.Builder(text, description).setTapAction(tap).build()
            else -> null
        }
    }

    companion object {
        fun requestUpdate(c: Context) {
            ComplicationDataSourceUpdateRequester.create(c, ComponentName(c, ProgressComplicationService::class.java)).requestUpdateAll()
        }
    }
}
