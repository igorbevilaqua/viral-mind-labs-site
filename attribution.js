// Atribuição da entrada em viralmindlabs.com até o POST de /aplicar.
// localStorage (vml_attr_v1) guarda o primeiro toque por 90 dias e o último toque.
// O jsonb utm sai achatado: chaves do último toque no topo e as mesmas com prefixo
// first_ para o primeiro. Cada valor é texto de no máximo 200 caracteres.
// Campanha é qualquer utm_* válido mais gclid e fbclid, até 20 chaves por toque.
// O último toque só muda quando a URL traz campanha.
(function (root) {
  "use strict";

  var CAMPAIGN_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"];
  var CAMPAIGN_KEY_RE = /^utm_[a-z0-9_]{1,36}$/;
  var CAMPAIGN_KEYS_MAX = 20;
  var CONTEXT_KEYS = ["landing_page", "referrer", "ts"];
  var TOUCH_KEYS = CAMPAIGN_KEYS.concat(CONTEXT_KEYS);
  var VALUE_MAX = 200;
  var JSON_MAX = 4800;
  var FIRST_TTL_MS = 90 * 24 * 60 * 60 * 1000;
  var STORAGE_KEY = "vml_attr_v1";

  function clip(value, max) {
    if (typeof value !== "string") return "";
    var clean = value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
    if (!clean) return "";
    var limit = max || VALUE_MAX;
    return clean.length > limit ? clean.slice(0, limit) : clean;
  }

  function originPath(raw) {
    if (typeof raw !== "string" || !raw) return "";
    try {
      var url = new URL(raw);
      if (url.protocol !== "http:" && url.protocol !== "https:") return "";
      return clip(url.origin + (url.pathname || "/"));
    } catch (err) {
      return "";
    }
  }

  function isCampaignKey(key) {
    return key === "gclid" || key === "fbclid" || CAMPAIGN_KEY_RE.test(key);
  }

  // As chaves conhecidas vêm antes das demais: fixam a ordem e têm prioridade no teto.
  function pickCampaign(keys, read) {
    var out = {};
    var count = 0;
    var ordered = CAMPAIGN_KEYS.concat(keys);
    for (var i = 0; i < ordered.length && count < CAMPAIGN_KEYS_MAX; i++) {
      var key = ordered[i];
      if (!isCampaignKey(key) || out[key]) continue;
      var value = clip(read(key));
      if (value) {
        out[key] = value;
        count++;
      }
    }
    return out;
  }

  function campaignKeys(touch) {
    if (!touch) return [];
    return Object.keys(touch).filter(function (key) {
      return isCampaignKey(key) && touch[key];
    });
  }

  function hasCampaign(touch) {
    return campaignKeys(touch).length > 0;
  }

  function sameCampaign(a, b) {
    if (!a || !b) return false;
    var keys = campaignKeys(a).concat(campaignKeys(b));
    for (var i = 0; i < keys.length; i++) {
      if ((a[keys[i]] || "") !== (b[keys[i]] || "")) return false;
    }
    return true;
  }

  function touchKeys(touch) {
    return campaignKeys(touch).concat(CONTEXT_KEYS);
  }

  function copyTouch(touch) {
    if (!touch) return null;
    var out = {};
    var keys = touchKeys(touch);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (touch[key]) out[key] = touch[key];
    }
    return Object.keys(out).length ? out : null;
  }

  function fresh(touch, now) {
    if (!touch || typeof touch.ts !== "string") return false;
    var then = Date.parse(touch.ts);
    if (!isFinite(then)) return false;
    var age = now - then;
    return age >= -60000 && age < FIRST_TTL_MS;
  }

  function sanitizeTouch(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    var out = pickCampaign(Object.keys(raw), function (key) { return raw[key]; });
    var landing = originPath(raw.landing_page);
    var referrer = originPath(raw.referrer);
    if (landing) out.landing_page = landing;
    if (referrer) out.referrer = referrer;
    if (typeof raw.ts === "string" && isFinite(Date.parse(raw.ts))) {
      out.ts = new Date(raw.ts).toISOString();
    }
    return Object.keys(out).length ? out : null;
  }

  function readStore(storage) {
    try {
      var raw = storage.getItem(STORAGE_KEY);
      if (!raw || raw.length > 20000) return null;
      var data = JSON.parse(raw);
      if (!data || typeof data !== "object") return null;
      return {
        first: sanitizeTouch(data.first),
        last: sanitizeTouch(data.last),
      };
    } catch (err) {
      return null;
    }
  }

  function writeStore(storage, data) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify({
        first: sanitizeTouch(data.first),
        last: sanitizeTouch(data.last),
      }));
      return true;
    } catch (err) {
      return false;
    }
  }

  function isAplicarPath(pathname) {
    var path = pathname || "";
    if (path.length > 1 && path.charAt(path.length - 1) === "/") path = path.slice(0, -1);
    return path === "/aplicar";
  }

  function shrink(obj, jsonMax) {
    var limit = jsonMax || JSON_MAX;
    var current = obj;
    var max = VALUE_MAX;
    var json = JSON.stringify(current);
    while (json.length > limit && max > 40) {
      max = Math.floor(max * 0.8);
      var next = {};
      var keys = Object.keys(current);
      for (var i = 0; i < keys.length; i++) {
        var value = clip(current[keys[i]], max);
        if (value) next[keys[i]] = value;
      }
      current = next;
      json = JSON.stringify(current);
    }
    var order = Object.keys(current);
    while (json.length > limit && order.length > 1) {
      delete current[order.pop()];
      json = JSON.stringify(current);
    }
    return Object.keys(current).length ? current : null;
  }

  function flatten(last, first, jsonMax) {
    var out = {};
    var i;
    var lastKeys = touchKeys(last);
    var firstKeys = touchKeys(first);
    for (i = 0; i < lastKeys.length; i++) {
      var key = lastKeys[i];
      if (last && last[key]) out[key] = last[key];
    }
    for (i = 0; i < firstKeys.length; i++) {
      var fkey = firstKeys[i];
      if (first && first[fkey]) out["first_" + fkey] = first[fkey];
    }
    if (!Object.keys(out).length) return null;
    return shrink(out, jsonMax);
  }

  function create(env) {
    var page = env.page;
    var storage = env.storage;
    var jsonMax = env.jsonMax || JSON_MAX;

    function now() {
      return env.now();
    }

    function currentTouch() {
      var params = new URLSearchParams(page.search || "");
      var touch = pickCampaign(Array.from(params.keys()), function (key) { return params.get(key); });
      var landing = originPath(page.href || "");
      var referrer = originPath(page.referrer || "");
      if (landing) touch.landing_page = landing;
      if (referrer) touch.referrer = referrer;
      touch.ts = new Date(now()).toISOString();
      return touch;
    }

    function capture() {
      var current = currentTouch();
      var stored = readStore(storage) || { first: null, last: null };
      var t = now();
      if (!fresh(stored.first, t)) {
        var opened = copyTouch(current);
        var kept = hasCampaign(current) ? opened : stored.last || opened;
        writeStore(storage, { first: opened, last: kept });
        return { first: opened, last: kept };
      }
      if (hasCampaign(current)) {
        var passThrough = isAplicarPath(page.pathname || "") && sameCampaign(stored.last, current);
        if (!passThrough) {
          var nextLast = copyTouch(current);
          writeStore(storage, { first: stored.first, last: nextLast });
          return { first: stored.first, last: nextLast };
        }
      }
      return stored;
    }

    function forSubmit() {
      capture();
      var current = currentTouch();
      var stored = readStore(storage) || { first: null, last: null };
      var last = null;
      if (hasCampaign(current)) {
        if (stored.last && sameCampaign(stored.last, current)) last = copyTouch(stored.last);
        else last = copyTouch(current);
      } else if (stored.last) {
        last = copyTouch(stored.last);
      } else {
        last = copyTouch(current);
      }
      if (last && hasCampaign(current) && stored.last && sameCampaign(stored.last, current)) {
        if (!last.landing_page && current.landing_page) last.landing_page = current.landing_page;
        if (!last.ts) last.ts = current.ts;
      }
      var first = fresh(stored.first, now()) ? copyTouch(stored.first) : copyTouch(last);
      return flatten(last, first, jsonMax);
    }

    function campaignSource() {
      var current = currentTouch();
      if (hasCampaign(current)) return current;
      var stored = readStore(storage);
      if (stored && hasCampaign(stored.last)) return stored.last;
      return null;
    }

    function decorateHref(href) {
      if (!href || href.charAt(0) === "#") return href;
      if (/^(mailto:|tel:|javascript:)/i.test(href)) return href;
      var base = page.origin || "https://viralmindlabs.com";
      var url;
      try {
        url = new URL(href, base);
      } catch (err) {
        return href;
      }
      if (url.origin !== base || !isAplicarPath(url.pathname)) return href;
      var source = campaignSource();
      if (!source) return href;
      var i;
      var existing = Array.from(url.searchParams.keys());
      for (i = 0; i < existing.length; i++) {
        if (isCampaignKey(existing[i])) url.searchParams.delete(existing[i]);
      }
      var keys = campaignKeys(source);
      for (i = 0; i < keys.length; i++) url.searchParams.set(keys[i], source[keys[i]]);
      var out = url.pathname + url.search + url.hash;
      return /^https?:\/\//i.test(href) ? url.origin + out : out;
    }

    function decorateDocument() {
      var doc = env.document;
      if (!doc || !doc.querySelectorAll) return;
      var links = doc.querySelectorAll("a[href]");
      for (var i = 0; i < links.length; i++) {
        var link = links[i];
        var href = link.getAttribute("href");
        var next = decorateHref(href);
        if (next && next !== href) link.setAttribute("href", next);
      }
    }

    function onClick(event) {
      try {
        var node = event && event.target;
        if (node && node.nodeType === 3) node = node.parentElement;
        var link = node && node.closest ? node.closest("a") : null;
        if (!link) return;
        var href = link.getAttribute("href");
        var next = decorateHref(href);
        if (next && next !== href) link.setAttribute("href", next);
      } catch (err) {}
    }

    function start() {
      try { capture(); } catch (err) {}
      try { decorateDocument(); } catch (err) {}
      try {
        if (env.document && env.document.addEventListener) {
          env.document.addEventListener("click", onClick, true);
        }
      } catch (err) {}
    }

    return {
      capture: capture,
      forSubmit: forSubmit,
      decorateHref: decorateHref,
      decorateDocument: decorateDocument,
      start: start,
      readStore: function () { return readStore(storage); },
    };
  }

  function safeStorage() {
    try {
      var store = root.localStorage;
      var probe = "vml_attr_probe";
      store.setItem(probe, "1");
      store.removeItem(probe);
      return store;
    } catch (err) {
      return {
        getItem: function () { return null; },
        setItem: function () {},
      };
    }
  }

  root.VMLAttribution = {
    create: create,
    clip: clip,
    originPath: originPath,
    CAMPAIGN_KEYS: CAMPAIGN_KEYS,
    CAMPAIGN_KEY_RE: CAMPAIGN_KEY_RE,
    CAMPAIGN_KEYS_MAX: CAMPAIGN_KEYS_MAX,
    isCampaignKey: isCampaignKey,
    TOUCH_KEYS: TOUCH_KEYS,
    VALUE_MAX: VALUE_MAX,
    JSON_MAX: JSON_MAX,
    FIRST_TTL_MS: FIRST_TTL_MS,
    STORAGE_KEY: STORAGE_KEY,
  };

  if (root.document && root.location) {
    var api = create({
      page: {
        get href() { return root.location.href; },
        get search() { return root.location.search; },
        get pathname() { return root.location.pathname; },
        get origin() { return root.location.origin; },
        get referrer() { return root.document.referrer || ""; },
      },
      storage: safeStorage(),
      now: function () { return Date.now(); },
      document: root.document,
    });
    root.VMLAttribution.forSubmit = function () { return api.forSubmit(); };
    root.VMLAttribution.capture = function () { return api.capture(); };
    root.VMLAttribution.decorateHref = function (href) { return api.decorateHref(href); };
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", api.start);
    } else {
      api.start();
    }
  }

  if (typeof module !== "undefined" && module.exports) module.exports = root.VMLAttribution;
})(typeof window !== "undefined" ? window : globalThis);
