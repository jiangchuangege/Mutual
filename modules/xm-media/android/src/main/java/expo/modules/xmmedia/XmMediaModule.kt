package expo.modules.xmmedia

import android.app.AppOpsManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.SystemClock
import android.provider.Settings
import android.text.TextUtils
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MediaAccessException : CodedException("没有「通知使用权」，先在系统设置里授权")

/**
 * 外部播放器（喜马拉雅 / 播客类 App）的播放状态读取与控制。
 *
 * 设计原则：**不搬音频、不碰版权**。
 * 声音永远在对方 App 里用你自己的账号播；我们只做三件事：
 *   1. 读它现在在放什么、放到第几秒（MediaSession 的 PlaybackState）；
 *   2. 控制它 播放 / 暂停 / 跳转（TransportControls）；
 *   3. 把这些告诉另一台设备，让两边进度对齐（走现有的「一起听」通道）。
 */
class XmMediaModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw CodedException("没有 Android 上下文")

  override fun definition() = ModuleDefinition {
    Name("XmMedia")

    /** 有没有「通知使用权」（没有就什么都读不到） */
    Function("hasAccess") {
      hasNotificationAccess(context)
    }

    /** 跳到系统的「通知使用权」页面，让用户勾上我们 */
    Function("openAccessSettings") {
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      true
    }

    /**
     * 当前有哪些 App 在放媒体（通常只有 1 个）。
     * 返回的 positionMs 已经把「从上次事件到现在流逝的时间」算进去了，可以直接用。
     */
    Function("sessions") {
      if (!hasNotificationAccess(context)) return@Function emptyList<Map<String, Any?>>()
      try {
        val manager = context.getSystemService(Context.MEDIA_SESSION_SERVICE) as MediaSessionManager
        val component = ComponentName(context, MediaWatchService::class.java)
        manager.getActiveSessions(component)
          /*
           * 排除自己：我们自己的焦焦FM/播放器也会注册 MediaSession（后台播放），
           * 不排掉的话界面会显示「外部播放器 = Mutual」并去控制自己，很荒谬。
           */
          .filter { it.packageName != context.packageName }
          .mapNotNull { describe(context, it) }
      } catch (err: SecurityException) {
        emptyList<Map<String, Any?>>()
      } catch (err: Throwable) {
        emptyList<Map<String, Any?>>()
      }
    }

    /** 控制某一台外部播放器：play / pause / toggle / seek(ms) / next / prev */
    Function("control") { packageName: String, action: String, positionMs: Double? ->
      if (!hasNotificationAccess(context)) throw MediaAccessException()
      val controller = controllerOf(context, packageName) ?: return@Function false
      val controls = controller.transportControls
      when (action) {
        "play" -> controls.play()
        "pause" -> controls.pause()
        "toggle" -> {
          val st = controller.playbackState?.state ?: PlaybackState.STATE_NONE
          if (st == PlaybackState.STATE_PLAYING) controls.pause() else controls.play()
        }
        "seek" -> controls.seekTo((positionMs ?: 0.0).toLong())
        "next" -> controls.skipToNext()
        "prev" -> controls.skipToPrevious()
        else -> return@Function false
      }
      true
    }
  }

  private fun controllerOf(ctx: Context, packageName: String): MediaController? {
    val manager = ctx.getSystemService(Context.MEDIA_SESSION_SERVICE) as MediaSessionManager
    val component = ComponentName(ctx, MediaWatchService::class.java)
    return try {
      manager.getActiveSessions(component).firstOrNull { it.packageName == packageName }
    } catch (err: Throwable) {
      null
    }
  }

  private fun describe(ctx: Context, controller: MediaController): Map<String, Any?>? {
    val state = controller.playbackState ?: return null
    val meta = controller.metadata
    val playing = state.state == PlaybackState.STATE_PLAYING
    var position = state.position
    if (playing) {
      /* PlaybackState 的 position 是「上报那一刻」的，要补上之后流逝的时间 */
      val age = SystemClock.elapsedRealtime() - state.lastPositionUpdateTime
      if (age > 0) position += age
    }
    val duration = meta?.getLong(MediaMetadata.METADATA_KEY_DURATION) ?: 0L
    val packageName = controller.packageName
    val rawTitle = meta?.getString(MediaMetadata.METADATA_KEY_TITLE)
      ?: meta?.getString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE)
      ?: ""
    val rawArtist = meta?.getString(MediaMetadata.METADATA_KEY_ARTIST)
      ?: meta?.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST)
      ?: ""
    return mapOf(
      "package" to packageName,
      "appLabel" to appLabelOf(ctx, packageName),
      /* 有些 App 把书名放 artist、章节放 title，两个都带出去让界面自己挑 */
      "title" to rawTitle,
      "artist" to rawArtist,
      "playing" to playing,
      "positionMs" to position.coerceAtLeast(0L),
      "durationMs" to duration.coerceAtLeast(0L),
      "canSeek" to ((state.actions and PlaybackState.ACTION_SEEK_TO) != 0L),
      "updatedAt" to System.currentTimeMillis()
    )
  }

  private fun appLabelOf(ctx: Context, packageName: String): String {
    return try {
      val pm = ctx.packageManager
      val info = pm.getApplicationInfo(packageName, 0)
      pm.getApplicationLabel(info).toString()
    } catch (err: Throwable) {
      packageName
    }
  }

  private fun hasNotificationAccess(ctx: Context): Boolean {
    if (MediaWatchService.connected) return true
    /* 双重判定：服务已连上，或系统设置里勾了我们 */
    val enabled = Settings.Secure.getString(ctx.contentResolver, "enabled_notification_listeners")
    if (!TextUtils.isEmpty(enabled)) {
      if (enabled.contains(ctx.packageName)) return true
      try {
        val component = ComponentName(ctx, MediaWatchService::class.java)
        if (enabled.contains(component.flattenToString())) return true
      } catch (err: Throwable) {
        /* 忽略 */
      }
    }
    /* AppOps 兜底（部分机型 enabled_notification_listeners 不更新） */
    return try {
      val ops = ctx.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
      val mode = ops.unsafeCheckOpNoThrow(
        "android:notification_listener_access",
        android.os.Process.myUid(),
        ctx.packageName
      )
      mode == AppOpsManager.MODE_ALLOWED
    } catch (err: Throwable) {
      false
    }
  }
}
