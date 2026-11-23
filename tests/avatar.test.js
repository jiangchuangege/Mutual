/* eslint-disable */
/**
 * 头像地址解析：真机上"传了头像但哪里都不显示"的两个根因都在这里被守住：
 *  1. 状态里存的是本地 file:// 路径 → 对方手机打不开；
 *  2. 相对路径必须拼上"当前连的服务器"才能取到图。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AVATAR_PATH_PREFIX,
  avatarExtFromUri,
  avatarKind,
  checkAvatarPayload,
  resolveAvatarUri,
} = require('../dist-core/avatar.js');

test('头像地址：相对路径要拼上服务器地址', () => {
  assert.equal(
    resolveAvatarUri('/avatar/TWABC-m3k1.jpg', 'http://192.168.1.100:8787'),
    'http://192.168.1.100:8787/avatar/TWABC-m3k1.jpg',
  );
  // 服务器地址结尾多一个斜杠也不能拼出 //avatar
  assert.equal(
    resolveAvatarUri('/avatar/a.jpg', 'https://sync.example.com/'),
    'https://sync.example.com/avatar/a.jpg',
  );
  // 不知道服务器是谁就先不显示（界面会退回 emoji，而不是显示空白方块）
  assert.equal(resolveAvatarUri('/avatar/a.jpg', ''), null);
});

test('头像地址：绝对地址 / data: / 旧版本地文件各自怎么处理', () => {
  assert.equal(
    resolveAvatarUri('https://x.test/a.jpg', 'http://y:8787'),
    'https://x.test/a.jpg',
    '绝对地址原样用（不重复拼服务器）',
  );
  assert.equal(resolveAvatarUri('data:image/png;base64,AAA', 'http://y:8787'), 'data:image/png;base64,AAA');
  assert.equal(
    resolveAvatarUri('file:///data/user/0/com.twospace.app/files/a.jpg', 'http://y:8787'),
    'file:///data/user/0/com.twospace.app/files/a.jpg',
    '旧版本的本地路径至少本机还能显示（会同时触发迁移）',
  );
  assert.equal(resolveAvatarUri(null, 'http://y:8787'), null);
  assert.equal(resolveAvatarUri('  ', 'http://y:8787'), null);
});

test('头像来源分类：决定要不要迁移到服务器', () => {
  assert.equal(avatarKind(null), 'none');
  assert.equal(avatarKind('/avatar/x.jpg'), 'remote');
  assert.equal(avatarKind('http://a/b.jpg'), 'remote');
  assert.equal(avatarKind('data:image/jpeg;base64,xx'), 'data');
  assert.equal(avatarKind('file:///x/y.jpg'), 'local');
  assert.equal(avatarKind('content://media/external/images/1'), 'local');
  assert.equal(AVATAR_PATH_PREFIX, '/avatar/');
});

test('上传前校验：空图 / 超大图直接拦下，别浪费一次请求', () => {
  assert.equal(checkAvatarPayload('').ok, false);
  assert.equal(checkAvatarPayload('abc').ok, false);
  const small = 'A'.repeat(200);
  assert.equal(checkAvatarPayload(small).ok, true);
  const huge = 'A'.repeat(3 * 1024 * 1024 + 10);
  assert.equal(checkAvatarPayload(huge).ok, false);
});

test('扩展名推断：png / webp 认得出来，其余按 jpg', () => {
  assert.equal(avatarExtFromUri('file:///a/b.png'), 'png');
  assert.equal(avatarExtFromUri('file:///a/b.webp?x=1'), 'webp');
  assert.equal(avatarExtFromUri('file:///a/b.jpeg'), 'jpg');
  assert.equal(avatarExtFromUri('file:///a/noext'), 'jpg');
});
