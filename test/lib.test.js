'use strict';

const test = require('node:test');
const assert = require('node:assert');
const lib = require('../src/lib');
const { validateConfig } = require('../scripts/build');
const config = require('../config.json');

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari',
  ipadDesktopMode: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
  instagramIOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Instagram 300.0',
  facebookAndroid: 'Mozilla/5.0 (Linux; Android 14) [FB_IAB/FB4A;FBAV/450.0]',
  tiktokAndroid: 'Mozilla/5.0 (Linux; Android 14) musical_ly_30.0 BytedanceWebview',
  macDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari'
};

test('parseQuery decodes keys, values and "+"', () => {
  assert.deepStrictEqual(lib.parseQuery('?a=1&b=hello+world&c=%F0%9F%91%8B&flag'), {
    a: '1', b: 'hello world', c: '👋', flag: ''
  });
});

test('parseQuery tolerates empty and malformed input', () => {
  assert.deepStrictEqual(lib.parseQuery(''), {});
  assert.deepStrictEqual(lib.parseQuery('?'), {});
  assert.deepStrictEqual(lib.parseQuery('?a=%E0%A4%A&b=2'), { b: '2' });
});

test('getScheme', () => {
  assert.strictEqual(lib.getScheme('MyApp://home'), 'myapp');
  assert.strictEqual(lib.getScheme('https://x.com'), 'https');
  assert.strictEqual(lib.getScheme('no-scheme'), null);
});

test('getHost ignores userinfo, port, path and case', () => {
  assert.strictEqual(lib.getHost('https://WWW.Example.com:8443/a?b#c'), 'www.example.com');
  assert.strictEqual(lib.getHost('https://www.example.com@evil.com/x'), 'evil.com');
});

test('getHost rejects backslash and whitespace tricks', () => {
  assert.strictEqual(lib.getHost('https://evil.com\\@www.example.com/'), '');
  assert.strictEqual(lib.getHost('https://www.example.com /x'), '');
});

test('detectPlatform', () => {
  assert.deepStrictEqual(lib.detectPlatform(UA.iphoneSafari, 5), { isIOS: true, isAndroid: false, isInApp: false });
  assert.strictEqual(lib.detectPlatform(UA.ipadDesktopMode, 5).isIOS, true);
  assert.strictEqual(lib.detectPlatform(UA.macDesktop, 0).isIOS, false);
  assert.strictEqual(lib.detectPlatform(UA.androidChrome, 5).isAndroid, true);
  assert.strictEqual(lib.detectPlatform(UA.instagramIOS, 5).isInApp, true);
  assert.strictEqual(lib.detectPlatform(UA.facebookAndroid, 5).isInApp, true);
  assert.strictEqual(lib.detectPlatform(UA.tiktokAndroid, 5).isInApp, true);
  assert.strictEqual(lib.detectPlatform(UA.androidChrome, 5).isInApp, false);
});

test('pickStrategy', () => {
  const pick = (ua, touch) => lib.pickStrategy(lib.detectPlatform(ua, touch));
  assert.strictEqual(pick(UA.facebookAndroid, 5), 'androidInApp');
  assert.strictEqual(pick(UA.instagramIOS, 5), 'iosInApp');
  assert.strictEqual(pick(UA.androidChrome, 5), 'androidBrowser');
  assert.strictEqual(pick(UA.iphoneSafari, 5), 'iosBrowser');
  assert.strictEqual(pick(UA.macDesktop, 0), 'desktop');
});

test('resolveConfig accepts a matching ?universal=', () => {
  const out = lib.resolveConfig(config, {
    universal: 'https://www.example.com/app/promo/summer?utm_source=ig'
  });
  assert.strictEqual(out.universalLink, 'https://www.example.com/app/promo/summer?utm_source=ig');
});

test('resolveConfig does not mutate the input config', () => {
  const copy = JSON.stringify(config);
  lib.resolveConfig(config, { universal: 'https://www.example.com/x' });
  assert.strictEqual(JSON.stringify(config), copy);
});

test('resolveConfig ignores ?deep= (custom schemes are not supported)', () => {
  const out = lib.resolveConfig(config, { deep: 'myapp://x' });
  assert.deepStrictEqual(out, config);
});

test('resolveConfig blocks other hosts, host spoofing and non-https', () => {
  for (const universal of [
    'https://evil.com/',
    'http://www.example.com/',
    'https://www.example.com.evil.com/',
    'https://evil.com\\@www.example.com/',
    'https://www.example.com@evil.com/',
    'javascript:alert(1)'
  ]) {
    assert.strictEqual(lib.resolveConfig(config, { universal }).universalLink, config.universalLink, universal);
  }
});

test('resolveConfig blocks intent injection through ?universal=', () => {
  for (const universal of [
    'https://www.example.com/x;S.browser_fallback_url=https://evil.com;end',
    'https://www.example.com/x y'
  ]) {
    assert.strictEqual(lib.resolveConfig(config, { universal }).universalLink, config.universalLink, universal);
  }
});

test('buildIntentUrl builds an App Link intent with the store as fallback', () => {
  assert.strictEqual(
    lib.buildIntentUrl('https://www.example.com/app/promo/1?utm=ig', config),
    'intent://www.example.com/app/promo/1?utm=ig#Intent;scheme=https;package=com.example.myapp;' +
    'S.browser_fallback_url=' + encodeURIComponent(config.androidStoreUrl) + ';end'
  );
});

test('buildIntentUrl drops the fragment and escapes ";"', () => {
  const url = lib.buildIntentUrl('https://www.example.com/a;b#frag', config);
  assert.ok(url.startsWith('intent://www.example.com/a%3Bb#Intent;scheme=https;'), url);
  assert.ok(!url.includes('frag'));
});

test('config.json passes validation', () => {
  assert.deepStrictEqual(validateConfig(config), []);
});

test('validateConfig reports bad values', () => {
  const errors = validateConfig({
    universalLink: 'http://x.com',
    iosStoreUrl: '',
    androidStoreUrl: 'https://play.google.com/x',
    androidPackage: 'bad',
    fallbackDelay: -1,
    inAppAndroidDelay: 3000
  });
  assert.strictEqual(errors.length, 4);
});

test('compareSemver', () => {
  const { compareSemver } = require('../scripts/check-version');
  assert.strictEqual(compareSemver('1.0.1', '1.0.0'), 1);
  assert.strictEqual(compareSemver('1.0.0', '1.0.0'), 0);
  assert.strictEqual(compareSemver('1.9.0', '1.10.0'), -1);
  assert.strictEqual(compareSemver('2.0.0', '1.99.99'), 1);
  assert.throws(() => compareSemver('1.0', '1.0.0'));
});
