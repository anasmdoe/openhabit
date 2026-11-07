package app.openhabit.wear

import app.openhabit.core.Prefs
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.WearableListenerService

/** Saves the server address and token the phone app sends (phone: WearConfig.send). */
class ConfigListenerService : WearableListenerService() {
    override fun onDataChanged(events: DataEventBuffer) {
        for (e in events) {
            if (e.type != DataEvent.TYPE_CHANGED || e.dataItem.uri.path != "/openhabit/config") continue
            val map = DataMapItem.fromDataItem(e.dataItem).dataMap
            Prefs.save(this, map.getString("baseUrl") ?: "", map.getString("token") ?: "")
            ProgressComplicationService.requestUpdate(this)
        }
    }
}
