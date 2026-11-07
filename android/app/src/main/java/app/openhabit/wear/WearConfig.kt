package app.openhabit.wear

import android.content.Context
import app.openhabit.core.Prefs
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable

/** Shares the server address and token with the OpenHabit watch app over the Wearable Data Layer. */
object WearConfig {
    const val PATH = "/openhabit/config"

    fun send(c: Context) {
        val req = PutDataMapRequest.create(PATH).apply {
            dataMap.putString("baseUrl", Prefs.baseUrl(c))
            dataMap.putString("token", Prefs.token(c))
            dataMap.putLong("at", System.currentTimeMillis()) // always a change, so the watch hears it
        }.asPutDataRequest().setUrgent()
        // No watch paired, or no Play services: nothing to do.
        runCatching { Wearable.getDataClient(c).putDataItem(req) }
    }
}
