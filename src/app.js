(function () {
  'use strict';

  var lib = window.DeeplinkLib;
  var CONFIG = lib.resolveConfig(window.DEEPLINK_CONFIG, lib.parseQuery(window.location.search));
  var platform = lib.detectPlatform(navigator.userAgent || navigator.vendor || '', navigator.maxTouchPoints);
  var isIOS = platform.isIOS;
  var isAndroid = platform.isAndroid;
  var isInApp = platform.isInApp;

  var $ = function (id) { return document.getElementById(id); };

  function showScreen(name) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) screens[i].classList.remove('active');
    $('screen-' + name).classList.add('active');
    $('menu-hint').classList.toggle('visible', name === 'instructions' && isInApp);
  }

  function showInstructions() {
    $(isIOS ? 'steps-ios' : 'steps-android').classList.remove('hidden');
    if (isAndroid) $('btn-retry').classList.remove('hidden');
    showScreen('instructions');
  }

  function showStore() {
    $('btn-store').href = isIOS ? CONFIG.iosStoreUrl : CONFIG.androidStoreUrl;
    showScreen('store');
  }

  var fallbackTimer = null;

  function cancelFallback() {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
  }

  function onVisibilityChange() {
    if (document.hidden || document.visibilityState === 'hidden') cancelFallback();
  }

  window.addEventListener('blur', cancelFallback);
  window.addEventListener('pagehide', cancelFallback);
  document.addEventListener('visibilitychange', onVisibilityChange);

  function scheduleFallback(delay, action) {
    cancelFallback();
    fallbackTimer = setTimeout(function () {
      fallbackTimer = null;
      if (!document.hidden) action();
    }, delay);
  }

  window.addEventListener('pageshow', function (e) {
    if (e.persisted && !isInApp) {
      cancelFallback();
      showStore();
    }
  });

  function navigate(url) {
    window.location.href = url;
  }

  function intentUrl() {
    return lib.buildIntentUrl(CONFIG.universalLink, CONFIG);
  }

  var strategies = {
    androidInApp: function () {
      navigate(intentUrl());
      scheduleFallback(CONFIG.inAppAndroidDelay, showInstructions);
    },
    iosInApp: function () {
      showInstructions();
    },
    androidBrowser: function () {
      navigate(intentUrl());
      scheduleFallback(CONFIG.fallbackDelay, showStore);
    },
    iosBrowser: function () {
      navigate(CONFIG.universalLink);
    },
    desktop: function () {
      window.location.replace(CONFIG.universalLink);
    }
  };

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    ta.style.fontSize = '16px';
    document.body.appendChild(ta);

    var range = document.createRange();
    range.selectNodeContents(ta);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    ta.setSelectionRange(0, text.length);

    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }

    sel.removeAllRanges();
    document.body.removeChild(ta);
    return ok;
  }

  function copyLink() {
    var url = window.location.href;
    var btn = $('btn-copy');

    function onSuccess() {
      btn.textContent = 'Link copied!';
      btn.classList.add('copied');
      setTimeout(function () {
        btn.textContent = 'Copy link';
        btn.classList.remove('copied');
      }, 2500);
    }

    function onFailure() {
      var input = $('manual-url');
      input.value = url;
      input.classList.add('visible');
      input.focus();
      input.setSelectionRange(0, url.length);
      btn.textContent = 'Press and hold the link to copy it';
    }

    function fallback() {
      if (legacyCopy(url)) onSuccess(); else onFailure();
    }

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(onSuccess, fallback);
    } else {
      fallback();
    }
  }

  $('btn-copy').addEventListener('click', copyLink);
  $('btn-retry').addEventListener('click', function () {
    navigate(intentUrl());
  });
  $('btn-open-again').addEventListener('click', function () {
    navigate(isAndroid ? intentUrl() : CONFIG.universalLink);
  });
  $('btn-web').href = CONFIG.universalLink;
  $('btn-store').href = isIOS ? CONFIG.iosStoreUrl : CONFIG.androidStoreUrl;

  setTimeout(strategies[lib.pickStrategy(platform)], 50);
})();
