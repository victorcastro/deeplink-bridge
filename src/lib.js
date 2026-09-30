(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DeeplinkLib = factory();
})(this, function () {
  'use strict';

  var IN_APP_PATTERNS = [
    /Instagram/i,
    /FBAN|FBAV|FB_IAB|FBIOS|FB4A/i,
    /musical_ly|BytedanceWebview|TikTok|trill/i,
    /Twitter/i,
    /LinkedInApp/i,
    /Snapchat/i
  ];

  function parseQuery(search) {
    var out = {};
    if (!search || search.length < 2) return out;
    var pairs = search.substring(1).split('&');
    for (var i = 0; i < pairs.length; i++) {
      if (!pairs[i]) continue;
      var idx = pairs[i].indexOf('=');
      var key = idx >= 0 ? pairs[i].substring(0, idx) : pairs[i];
      var val = idx >= 0 ? pairs[i].substring(idx + 1) : '';
      try {
        out[decodeURIComponent(key)] = decodeURIComponent(val.replace(/\+/g, ' '));
      } catch (e) {}
    }
    return out;
  }

  function getScheme(url) {
    var m = /^([a-z][a-z0-9+.\-]*):/i.exec(url || '');
    return m ? m[1].toLowerCase() : null;
  }

  function hasUnsafeChars(url) {
    return /[\\\s\u0000-\u001f\u007f]/.test(url);
  }

  function getHost(url) {
    if (!url || hasUnsafeChars(url)) return '';
    var m = /^[a-z][a-z0-9+.\-]*:\/\/(?:[^\/?#@]*@)?([^\/?#:]+)/i.exec(url);
    return m ? m[1].toLowerCase() : '';
  }

  function resolveConfig(config, params) {
    var out = {};
    for (var k in config) if (Object.prototype.hasOwnProperty.call(config, k)) out[k] = config[k];

    var universal = params.universal;
    var host = getHost(config.universalLink);
    if (universal &&
        !hasUnsafeChars(universal) &&
        universal.indexOf(';') === -1 &&
        getScheme(universal) === 'https' &&
        host &&
        getHost(universal) === host) {
      out.universalLink = universal;
    }
    return out;
  }

  function detectPlatform(ua, maxTouchPoints) {
    ua = ua || '';
    var isIOS = /iPhone|iPad|iPod/i.test(ua) ||
                (/Macintosh/i.test(ua) && (maxTouchPoints || 0) > 1);
    var isAndroid = /Android/i.test(ua);
    var isInApp = false;
    for (var i = 0; i < IN_APP_PATTERNS.length; i++) {
      if (IN_APP_PATTERNS[i].test(ua)) { isInApp = true; break; }
    }
    return { isIOS: isIOS, isAndroid: isAndroid, isInApp: isInApp };
  }

  function pickStrategy(p) {
    if (p.isAndroid && p.isInApp) return 'androidInApp';
    if (p.isIOS && p.isInApp) return 'iosInApp';
    if (p.isAndroid) return 'androidBrowser';
    if (p.isIOS) return 'iosBrowser';
    return 'desktop';
  }

  function buildIntentUrl(universalLink, config) {
    var m = /^https:\/\/([^#]*)/i.exec(universalLink);
    var rest = m ? m[1].replace(/;/g, '%3B') : '';
    return 'intent://' + rest +
      '#Intent' +
      ';scheme=https' +
      ';package=' + config.androidPackage +
      ';S.browser_fallback_url=' + encodeURIComponent(config.androidStoreUrl) +
      ';end';
  }

  return {
    parseQuery: parseQuery,
    getScheme: getScheme,
    getHost: getHost,
    resolveConfig: resolveConfig,
    detectPlatform: detectPlatform,
    pickStrategy: pickStrategy,
    buildIntentUrl: buildIntentUrl
  };
});
