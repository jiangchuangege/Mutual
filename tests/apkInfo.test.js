// APK 包名解析测试（用真实构建出来的 APK 当样本）
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const { listZipEntries, readZipEntry, packageNameFromManifest, packageNameOfApk, looksLikeApk } = require('../dist-core/apkInfo.js');

const inflate = (b) => zlib.inflateRawSync(b);

/** 找一个能当样本的 APK：优先用最近构建出来的 Mutual 包 */
function sampleApk() {
  const dir = 'C:/Users/Jiao/Documents';
  try {
    const cands = fs
      .readdirSync(dir)
      .filter((f) => /^Mutual-v.*\.apk$/i.test(f))
      .map((f) => path.join(dir, f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (cands.length) return cands[0];
  } catch {
    /* 忽略 */
  }
  for (const f of ['C:/Users/Jiao/Downloads/jester.com-release.apk']) {
    if (fs.existsSync(f)) return f;
  }
  return null;
}

test('zip 目录能读出来（APK 就是 zip）', (t) => {
  const apkPath = sampleApk();
  if (!apkPath) {
    t.skip('找不到样本 APK，跳过');
    return;
  }
  const data = new Uint8Array(fs.readFileSync(apkPath));
  const entries = listZipEntries(data);
  assert.ok(entries.length > 50, '应该有很多条目，实际 ' + entries.length);
  assert.ok(entries.some((e) => e.name === 'AndroidManifest.xml'));
});

test('从真实的 APK 里读出包名', (t) => {
  const apkPath = sampleApk();
  if (!apkPath) {
    t.skip('找不到样本 APK，跳过');
    return;
  }
  const data = new Uint8Array(fs.readFileSync(apkPath));
  const pkg = packageNameOfApk(data, inflate);
  assert.ok(pkg && /^[a-zA-Z][\w.]*$/.test(pkg), '包名要像一个包名，实际：' + pkg);
  assert.equal(looksLikeApk(data), true);
  // 我们自己构建的包，包名必须是这个
  if (/Mutual-v/i.test(apkPath)) assert.equal(pkg, 'com.twospace.app');
});

test('不是 APK 的东西一律返回 null，不抛错', () => {
  assert.equal(packageNameOfApk(new Uint8Array([1, 2, 3])), null);
  assert.equal(packageNameOfApk(new Uint8Array(0)), null);
  assert.equal(looksLikeApk(new Uint8Array([0x50, 0x4b, 0x03, 0x04])), false);
  assert.equal(packageNameFromManifest(new Uint8Array(8)), null);
  // 空 zip（只有 EOCD）
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  assert.deepEqual(listZipEntries(new Uint8Array(eocd)), []);
});

test('手工造的最小 AXML 也能解析出包名', () => {
  // 字符串池：'manifest'、'package'、'com.demo.game'
  const strings = ['manifest\0', 'package\0', 'com.demo.game\0'];
  const utf16 = [];
  for (const s of strings) {
    // 真正的 AXML 里长度不含结尾的 \0，所以要写 length-1
    utf16.push(s.length - 1);
    for (const ch of s) utf16.push(ch.charCodeAt(0));
  }
  const strData = Buffer.from(new Uint16Array(utf16).buffer);
  const strCount = strings.length;
  const strOffsets = Buffer.alloc(strCount * 4);
  let acc = 0;
  for (let i = 0; i < strCount; i += 1) {
    strOffsets.writeUInt32LE(acc, i * 4);
    acc += (strings[i].length + 1) * 2; // 长度前缀 1 个 u16 + 字符串（含 \0）
  }
  const poolHeader = 28;
  const poolSize = poolHeader + strOffsets.length + strData.length;
  const pool = Buffer.alloc(poolSize);
  pool.writeUInt16LE(0x0001, 0);
  pool.writeUInt16LE(poolHeader, 2);
  pool.writeUInt32LE(poolSize, 4);
  pool.writeUInt32LE(strCount, 8);
  pool.writeUInt32LE(0, 12);
  pool.writeUInt32LE(0, 16); // 不是 UTF-8 → UTF-16LE
  pool.writeUInt32LE(poolHeader + strOffsets.length, 20);
  strOffsets.copy(pool, poolHeader);
  strData.copy(pool, poolHeader + strOffsets.length);

  // start element：manifest(package="com.demo.game")
  // attributeStart 是相对 attrExt 结构（= 块头 8 字节之后）的偏移
  const attrStart = 20;
  const attrCount = 1;
  const elSize = 8 + attrStart + attrCount * 20;
  const el = Buffer.alloc(elSize);
  el.writeUInt16LE(0x0102, 0);
  el.writeUInt16LE(8, 2);
  el.writeUInt32LE(elSize, 4);
  el.writeUInt32LE(0xffffffff, 8); // ns
  el.writeUInt32LE(0, 12); // name → 'manifest'
  el.writeUInt16LE(attrStart, 16);
  el.writeUInt16LE(20, 18);
  el.writeUInt16LE(attrCount, 20);
  const at = 8 + attrStart;
  el.writeUInt32LE(0xffffffff, at); // attr ns
  el.writeUInt32LE(1, at + 4); // attr name → 'package'
  el.writeUInt32LE(2, at + 8); // rawValue → 'com.demo.game'
  el.writeUInt16LE(8, at + 12);
  el.writeUInt8(0, at + 14);
  el.writeUInt8(0x03, at + 15); // 类型 = 字符串
  el.writeUInt32LE(2, at + 16);

  const total = 8 + poolSize + elSize;
  const axml = Buffer.alloc(total);
  axml.writeUInt16LE(0x0003, 0);
  axml.writeUInt16LE(8, 2);
  axml.writeUInt32LE(total, 4);
  pool.copy(axml, 8);
  el.copy(axml, 8 + poolSize);

  assert.equal(packageNameFromManifest(new Uint8Array(axml)), 'com.demo.game');
});
