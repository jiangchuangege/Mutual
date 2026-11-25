package expo.modules.xmmedia

import android.service.notification.NotificationListenerService
import android.util.Log

/**
 * 只用来「拿到通知使用权」的壳服务。
 *
 * Android 的规则：想读别的 App 的 MediaSession，调用方必须持有一个
 * NotificationListenerService（用户在系统设置里授权「通知使用权」）。
 * 我们不读任何通知内容 —— 只借这个授权去 `MediaSessionManager.getActiveSessions()`。
 */
class MediaWatchService : NotificationListenerService() {
  override fun onListenerConnected() {
    super.onListenerConnected()
    connected = true
    Log.d(TAG, "listener connected")
  }

  override fun onListenerDisconnected() {
    super.onListenerDisconnected()
    connected = false
    Log.d(TAG, "listener disconnected")
  }

  companion object {
    private const val TAG = "XmMedia"

    @Volatile
    var connected: Boolean = false
      private set
  }
}
