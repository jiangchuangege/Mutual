/* eslint-disable */
/** 粘贴进来的东西怎么跑：HTML=内嵌 / 链接=交系统 / 源码=只存不跑 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { detectGameKind, describeKind, kindBadge, canPlayInline } = require('../dist-core/gameKind.js');

test('HTML 识别：DOCTYPE / html 标签 / 只有 canvas+script 的片段都算', () => {
  assert.equal(detectGameKind('<!doctype html><html><body></body></html>'), 'html');
  assert.equal(detectGameKind('<html lang="en"><body>hi</body></html>'), 'html');
  assert.equal(detectGameKind('<canvas id="c"></canvas><script>1</script>'), 'html');
  assert.equal(detectGameKind('  <div>游戏</div> '), 'html');
});

test('链接识别：http(s) / market / intent 交给手机系统打开', () => {
  assert.equal(detectGameKind('https://play.google.com/store/apps/details?id=com.x'), 'link');
  assert.equal(detectGameKind('http://example.com/game'), 'link');
  assert.equal(detectGameKind('market://details?id=com.tencent.tmgp.sgame'), 'link');
  assert.equal(detectGameKind('intent://scan/#Intent;scheme=zxing;end'), 'link');
});

test('源码识别：Java / Kotlin / C# / RN 这些手机里跑不了', () => {
  assert.equal(detectGameKind('public class Main { public static void main(String[] a){} }'), 'source');
  assert.equal(detectGameKind('using UnityEngine;\npublic class Pong : MonoBehaviour {}'), 'source');
  assert.equal(detectGameKind('import React from "react";\nexport default function Game(){return null}'), 'source');
  assert.equal(detectGameKind(''), 'source');
});

test('带空格的链接不算纯链接（避免把一整段代码误判）', () => {
  assert.equal(detectGameKind('https://a.com/x 这是说明'), 'source');
});

test('说明文案与角标', () => {
  assert.match(describeKind('html'), /App 里直接打开/);
  assert.match(describeKind('link'), /手机系统打开/);
  assert.match(describeKind('source'), /跑不了/);
  assert.equal(kindBadge('html'), 'HTML');
  assert.equal(kindBadge('link'), '链接');
  assert.equal(kindBadge('source'), '源码');
});

test('能不能在 App 里"一起玩"：只有 HTML 行（3D 体素内置除外）', () => {
  assert.equal(canPlayInline({ kind: 'html' }), true);
  assert.equal(canPlayInline({ kind: undefined }), true);
  assert.equal(canPlayInline({ kind: 'link' }), false);
  assert.equal(canPlayInline({ kind: 'source' }), false);
  assert.equal(canPlayInline({ kind: '', builtin: 'voxel3d' }), true);
});
