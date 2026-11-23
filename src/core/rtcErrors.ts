/**
 * RTC 错误分类与用户文案（纯函数，可测试）
 *
 * 目标：任何 RTC 失败都不是"甩一个错误码给用户"，而是给出
 *   ① 发生了什么（人话）② 你现在能做什么 ③ 需要的话怎么解决。
 *
 * 额度用完（Agora 免费分钟数耗尽 / 并发超限 / 账户欠费）单独成一类，
 * 因为这是唯一需要"去官网充值"才能继续的情况。
 */

export type RtcErrorKind = 'quota' | 'token' | 'config' | 'network' | 'device' | 'unknown';

export interface RtcErrorInfo {
  kind: RtcErrorKind;
  /** 弹窗标题 */
  title: string;
  /** 弹窗正文（人话解释） */
  body: string;
  /** 一行技术细节，便于排查（可折叠展示） */
  detail: string;
  /** 是否建议去官网充值 */
  canRecharge: boolean;
  /** 是否值得点"重试" */
  canRetry: boolean;
  /** 主按钮文案（没有则为 null） */
  primaryLabel: string | null;
}

/** Agora 官网（充值入口） */
export const AGORA_CONSOLE_URL = 'https://console.agora.io/';

/**
 * 已知的错误码。Agora 不同版本对"额度"相关错误的编号不完全一致，
 * 所以这里做两层判断：**先看错误码白名单，再看文案关键词**，
 * 两边任一命中都按额度处理——宁可多给一个友好的充值入口，也不要甩错误码。
 */
const QUOTA_CODES = new Set([
  161, // 许可凭证无效（额度/计费异常时常见）
  162, // 许可凭证过期
  163, // 并发/连接数超限
  164, // 用量超限
  1058, // 频道并发超限
  17, // join channel rejected
]);

const TOKEN_CODES = new Set([109, 110, 120]);
const CONFIG_CODES = new Set([101, 102, 103]);
const NETWORK_CODES = new Set([111, 112, 113, 114]);

const QUOTA_KEYWORDS = [
  'quota',
  'exceed',
  'overuse',
  'limit',
  'concurrent',
  'insufficient',
  'balance',
  'minutes',
  'billing',
  'account',
  '额度',
  '超限',
  '欠费',
  '余额',
];

export function classifyRtcError(code: number | null, message: string | null): RtcErrorInfo {
  const msg = (message ?? '').toLowerCase();
  const hasQuotaKeyword = QUOTA_KEYWORDS.some((k) => msg.includes(k.toLowerCase()));
  const codeText = code === null ? '未知' : String(code);
  const detail = `错误码 ${codeText}${message ? ` · ${message}` : ''}`;

  const isQuota = (code !== null && QUOTA_CODES.has(code)) || hasQuotaKeyword;

  if (isQuota) {
    return {
      kind: 'quota',
      title: '语音额度已用完',
      body:
        '这次没能接通，是因为语音服务商的可用额度已经用完（免费分钟数耗尽或并发已达上限）。' +
        '充值后即可继续使用语音通话；文字、清单、相册、日历等功能完全不受影响。',
      detail,
      canRecharge: true,
      canRetry: true,
      primaryLabel: '去官网充值',
    };
  }

  if (code !== null && TOKEN_CODES.has(code)) {
    return {
      kind: 'token',
      title: '语音鉴权需要更新',
      body:
        '语音频道的通行凭证失效或缺失了。如果你用的是「APP ID + 证书」模式，' +
        '请确认 token 服务在运行，并在 app.json 里填好 rtcTokenServer；' +
        '如果用「APP ID 无证书」模式，把 rtcTokenServer 留空即可。',
      detail,
      canRecharge: false,
      canRetry: true,
      primaryLabel: '重试一次',
    };
  }

  if (code !== null && CONFIG_CODES.has(code)) {
    return {
      kind: 'config',
      title: '语音服务还没配置好',
      body:
        '看起来 App ID 或频道名不正确。请检查 app.json 的 extra.rtcAppId 是否是 32 位有效 App ID，' +
        '修改后需要重新打包才会生效。',
      detail,
      canRecharge: false,
      canRetry: false,
      primaryLabel: null,
    };
  }

  if (code !== null && NETWORK_CODES.has(code)) {
    return {
      kind: 'network',
      title: '网络连不上语音服务',
      body:
        '当前网络无法建立语音通道（可能是弱网、代理或防火墙拦截了 UDP）。' +
        '可以先切到「仅文字」继续聊，等网络好一点再重试。',
      detail,
      canRecharge: false,
      canRetry: true,
      primaryLabel: '重试一次',
    };
  }

  if (msg.includes('permission') || msg.includes('microphone') || msg.includes('麦克风')) {
    return {
      kind: 'device',
      title: '拿不到麦克风权限',
      body: '系统没有授予麦克风权限，语音无法采集。到系统设置里允许「Mutual」使用麦克风即可。',
      detail,
      canRecharge: false,
      canRetry: false,
      primaryLabel: null,
    };
  }

  return {
    kind: 'unknown',
    title: '语音暂时没接通',
    body:
      '没有识别出具体原因，可能只是瞬时故障。可以先切到「仅文字」继续聊，' +
      '稍后再点重试；如果反复出现，把下面的错误码发给我们即可定位。',
    detail,
    canRecharge: false,
    canRetry: true,
    primaryLabel: '重试一次',
  };
}
