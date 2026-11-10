const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { create, VALUE_MAX, FIRST_TTL_MS, STORAGE_KEY, CAMPAIGN_KEYS_MAX, isCampaignKey, readQuery } = require("./attribution.js");

const T0 = Date.parse("2026-10-30T08:00:00.000Z");

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
  };
}

function blockedStorage() {
  return {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
}

function page(overrides) {
  const state = Object.assign({
    href: "https://viralmindlabs.com/",
    search: "",
    pathname: "/",
    origin: "https://viralmindlabs.com",
    referrer: "",
  }, overrides);
  return state;
}

function setup(overrides) {
  const state = {
    page: page(overrides && overrides.page),
    storage: (overrides && overrides.storage) || memoryStorage(),
    now: T0,
    jsonMax: overrides && overrides.jsonMax,
    clicks: [],
  };
  const links = [];
  const doc = {
    readyState: "complete",
    querySelectorAll() {
      return links;
    },
    addEventListener(type, fn) {
      if (type === "click") state.clicks.push(fn);
    },
  };
  const api = create({
    page: state.page,
    storage: state.storage,
    now: () => state.now,
    document: doc,
    jsonMax: state.jsonMax,
  });
  state.api = api;
  state.links = links;
  state.doc = doc;
  return state;
}

function link(href) {
  const el = {
    href,
    children: [],
    getAttribute() {
      return el.href;
    },
    setAttribute(name, value) {
      if (name === "href") el.href = value;
    },
    closest() {
      return el;
    },
  };
  return el;
}

const CAMP = "?utm_source=instagram&utm_medium=bio&utm_campaign=autoridade&utm_term=viral&utm_content=link&fbclid=IwAR123&gclid=Cj0test";

test("entrada com campanha grava first e last e corta referrer na origem e no caminho", () => {
  const ctx = setup({
    page: page({
      href: "https://viralmindlabs.com/" + CAMP + "#topo",
      search: CAMP,
      referrer: "https://l.instagram.com/reels?igsh=secreto",
    }),
  });
  const stored = ctx.api.capture();
  assert.equal(stored.first.utm_source, "instagram");
  assert.equal(stored.first.utm_medium, "bio");
  assert.equal(stored.first.utm_campaign, "autoridade");
  assert.equal(stored.first.utm_term, "viral");
  assert.equal(stored.first.utm_content, "link");
  assert.equal(stored.first.fbclid, "IwAR123");
  assert.equal(stored.first.gclid, "Cj0test");
  assert.equal(stored.first.landing_page, "https://viralmindlabs.com/");
  assert.equal(stored.first.referrer, "https://l.instagram.com/reels");
  assert.equal(stored.first.ts, "2026-10-30T08:00:00.000Z");
  assert.deepEqual(stored.last, stored.first);
  assert.equal(Object.hasOwn(stored.first, "utm_foo"), false);
});

test("jsonb achatado: last-touch no topo e first_ no mesmo nível, só texto", () => {
  const ctx = setup({
    page: page({
      href: "https://viralmindlabs.com/" + CAMP,
      search: CAMP,
      referrer: "https://www.google.com/search?q=viral",
    }),
  });
  const utm = ctx.api.forSubmit();
  assert.deepEqual(Object.keys(utm), [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "gclid",
    "fbclid",
    "landing_page",
    "referrer",
    "ts",
    "first_utm_source",
    "first_utm_medium",
    "first_utm_campaign",
    "first_utm_term",
    "first_utm_content",
    "first_gclid",
    "first_fbclid",
    "first_landing_page",
    "first_referrer",
    "first_ts",
  ]);
  for (const value of Object.values(utm)) {
    assert.equal(typeof value, "string");
    assert.ok(value.length <= VALUE_MAX);
    assert.equal(value.includes("{"), false);
  }
  assert.equal(Object.hasOwn(utm, "first"), false);
  assert.equal(utm.first_utm_source, "instagram");
  assert.equal(utm.landing_page, "https://viralmindlabs.com/");
  assert.equal(utm.referrer, "https://www.google.com/search");
});

test("segunda campanha em 90 dias troca o last e mantém o first", () => {
  const ctx = setup({
    page: page({
      href: "https://viralmindlabs.com/?utm_source=google&utm_medium=cpc&gclid=aaa",
      search: "?utm_source=google&utm_medium=cpc&gclid=aaa",
      referrer: "https://www.google.com/",
    }),
  });
  ctx.api.capture();
  ctx.now = T0 + 10 * 24 * 60 * 60 * 1000;
  ctx.page.href = "https://viralmindlabs.com/?utm_source=instagram&utm_medium=paid&fbclid=bbb";
  ctx.page.search = "?utm_source=instagram&utm_medium=paid&fbclid=bbb";
  ctx.page.referrer = "https://l.facebook.com/l.php";
  const utm = ctx.api.forSubmit();
  assert.equal(utm.utm_source, "instagram");
  assert.equal(utm.utm_medium, "paid");
  assert.equal(utm.fbclid, "bbb");
  assert.equal(Object.hasOwn(utm, "gclid"), false);
  assert.equal(utm.first_utm_source, "google");
  assert.equal(utm.first_utm_medium, "cpc");
  assert.equal(utm.first_gclid, "aaa");
  assert.equal(utm.first_ts, "2026-10-30T08:00:00.000Z");
  assert.equal(utm.ts, "2026-11-09T08:00:00.000Z");
});

test("depois de 90 dias o próximo acesso vira o novo first", () => {
  const ctx = setup({
    page: page({
      href: "https://viralmindlabs.com/?utm_source=google",
      search: "?utm_source=google",
    }),
  });
  ctx.api.capture();
  ctx.now = T0 + FIRST_TTL_MS;
  ctx.page.href = "https://viralmindlabs.com/?utm_source=newsletter";
  ctx.page.search = "?utm_source=newsletter";
  const utm = ctx.api.forSubmit();
  assert.equal(utm.utm_source, "newsletter");
  assert.equal(utm.first_utm_source, "newsletter");
});

test("passagem para /aplicar nao inventa referrer quando a entrada nao tinha", () => {
  const ctx = setup({
    page: page({
      href: "https://viralmindlabs.com/?utm_source=ig",
      search: "?utm_source=ig",
      referrer: "",
    }),
  });
  ctx.api.capture();
  ctx.page.href = "https://viralmindlabs.com/aplicar/?utm_source=ig";
  ctx.page.search = "?utm_source=ig";
  ctx.page.pathname = "/aplicar/";
  ctx.page.referrer = "https://viralmindlabs.com/?utm_source=ig";
  const utm = ctx.api.forSubmit();
  assert.equal(utm.utm_source, "ig");
  assert.equal(utm.landing_page, "https://viralmindlabs.com/");
  assert.equal(Object.hasOwn(utm, "referrer"), false);
  assert.equal(Object.hasOwn(utm, "first_referrer"), false);
});

test("/aplicar com a mesma campanha preserva landing_page e referrer da entrada", () => {
  const ctx = setup({
    page: page({
      href: "https://viralmindlabs.com/?utm_source=ig&utm_medium=bio",
      search: "?utm_source=ig&utm_medium=bio",
      referrer: "https://l.instagram.com/",
    }),
  });
  ctx.api.capture();
  ctx.page.href = "https://viralmindlabs.com/aplicar?utm_source=ig&utm_medium=bio";
  ctx.page.search = "?utm_source=ig&utm_medium=bio";
  ctx.page.pathname = "/aplicar";
  ctx.page.referrer = "https://viralmindlabs.com/?utm_source=ig&utm_medium=bio";
  const utm = ctx.api.forSubmit();
  assert.equal(utm.utm_source, "ig");
  assert.equal(utm.utm_medium, "bio");
  assert.equal(utm.landing_page, "https://viralmindlabs.com/");
  assert.equal(utm.referrer, "https://l.instagram.com/");
  assert.equal(utm.first_landing_page, "https://viralmindlabs.com/");
  assert.equal(utm.first_referrer, "https://l.instagram.com/");
});

test("campanha diferente na URL não herda chaves da campanha anterior", () => {
  const ctx = setup({
    page: page({
      href: "https://viralmindlabs.com/?utm_source=google&utm_medium=cpc&utm_campaign=marca",
      search: "?utm_source=google&utm_medium=cpc&utm_campaign=marca",
    }),
  });
  ctx.api.capture();
  ctx.page.href = "https://viralmindlabs.com/aplicar?utm_source=ig";
  ctx.page.search = "?utm_source=ig";
  ctx.page.pathname = "/aplicar";
  ctx.page.referrer = "https://ads.example/click?keep=1";
  const utm = ctx.api.forSubmit();
  assert.equal(utm.utm_source, "ig");
  assert.equal(Object.hasOwn(utm, "utm_medium"), false);
  assert.equal(Object.hasOwn(utm, "utm_campaign"), false);
  assert.equal(utm.landing_page, "https://viralmindlabs.com/aplicar");
  assert.equal(utm.referrer, "https://ads.example/click");
  assert.equal(utm.first_utm_source, "google");
  assert.equal(utm.first_utm_medium, "cpc");
  assert.equal(utm.first_utm_campaign, "marca");
});

test("sem query em /aplicar, o envio usa o last-touch guardado", () => {
  const ctx = setup({
    page: page({
      href: "https://viralmindlabs.com/?utm_source=ig&fbclid=zzz",
      search: "?utm_source=ig&fbclid=zzz",
      referrer: "https://m.facebook.com/story",
    }),
  });
  ctx.api.capture();
  ctx.page.href = "https://viralmindlabs.com/aplicar";
  ctx.page.search = "";
  ctx.page.pathname = "/aplicar";
  ctx.page.referrer = "https://viralmindlabs.com/";
  const utm = ctx.api.forSubmit();
  assert.equal(utm.utm_source, "ig");
  assert.equal(utm.fbclid, "zzz");
  assert.equal(utm.landing_page, "https://viralmindlabs.com/");
  assert.equal(utm.referrer, "https://m.facebook.com/story");
});

test("storage bloqueado ainda leva a campanha da URL e propaga no link", () => {
  const ctx = setup({
    storage: blockedStorage(),
    page: page({
      href: "https://viralmindlabs.com/?utm_source=ig&utm_content=bio",
      search: "?utm_source=ig&utm_content=bio",
      referrer: "https://l.instagram.com/x?token=abc",
    }),
  });
  const utm = ctx.api.forSubmit();
  assert.equal(utm.utm_source, "ig");
  assert.equal(utm.utm_content, "bio");
  assert.equal(utm.first_utm_source, "ig");
  assert.equal(utm.landing_page, "https://viralmindlabs.com/");
  assert.equal(utm.referrer, "https://l.instagram.com/x");
  assert.equal(
    ctx.api.decorateHref("/aplicar"),
    "/aplicar?utm_source=ig&utm_content=bio"
  );
});

test("links de /aplicar recebem só chaves de campanha, também a partir do storage", () => {
  const ctx = setup({
    page: page({
      href: "https://viralmindlabs.com/?utm_source=ig&email=pessoa@x.com&utm_fo-o=nao",
      search: "?utm_source=ig&email=pessoa@x.com&utm_fo-o=nao",
    }),
  });
  ctx.api.capture();
  assert.equal(ctx.api.decorateHref("/aplicar"), "/aplicar?utm_source=ig");
  assert.equal(ctx.api.decorateHref("/aplicar/"), "/aplicar/?utm_source=ig");
  assert.equal(ctx.api.decorateHref("/aplicar#fim"), "/aplicar?utm_source=ig#fim");
  assert.equal(ctx.api.decorateHref("https://instagram.com/igorbevilaqua/"), "https://instagram.com/igorbevilaqua/");
  assert.equal(ctx.api.decorateHref("mailto:oi@viralmindlabs.com"), "mailto:oi@viralmindlabs.com");
  ctx.page.search = "";
  ctx.page.href = "https://viralmindlabs.com/";
  assert.equal(ctx.api.decorateHref("/aplicar"), "/aplicar?utm_source=ig");
});

test("clique atualiza o href antes da navegação", () => {
  const ctx = setup({
    page: page({
      href: "https://viralmindlabs.com/?utm_source=ig&utm_medium=bio",
      search: "?utm_source=ig&utm_medium=bio",
    }),
  });
  const button = link("/aplicar");
  ctx.links.push(button);
  ctx.api.start();
  assert.equal(button.href, "/aplicar?utm_source=ig&utm_medium=bio");
  button.href = "/aplicar";
  ctx.clicks[0]({ target: { nodeType: 3, parentElement: button } });
  assert.equal(button.href, "/aplicar?utm_source=ig&utm_medium=bio");
});

test("storage corrompido é ignorado e o valor longo é cortado em 200", () => {
  const ctx = setup({
    page: page({
      href: "https://viralmindlabs.com/?utm_source=" + "a".repeat(240) + "&utm_medium=%0a%0d%20bio%20",
      search: "?utm_source=" + "a".repeat(240) + "&utm_medium=%0a%0d%20bio%20",
    }),
  });
  ctx.storage.setItem(STORAGE_KEY, "{não é json");
  const utm = ctx.api.forSubmit();
  assert.equal(utm.utm_source.length, 200);
  assert.equal(utm.utm_medium, "bio");
  assert.equal(utm.first_utm_source.length, 200);
});

test("visita direta sem campanha grava landing_page e ts, e omite referrer vazio", () => {
  const ctx = setup();
  const utm = ctx.api.forSubmit();
  assert.deepEqual(Object.keys(utm), ["landing_page", "ts", "first_landing_page", "first_ts"]);
  assert.equal(utm.landing_page, "https://viralmindlabs.com/");
  assert.equal(utm.first_landing_page, "https://viralmindlabs.com/");
});

test("referrer que não é http fica de fora e chave fora da lista não entra", () => {
  const ctx = setup({
    page: page({
      href: "https://viralmindlabs.com/?utm_source=ig",
      search: "?utm_source=ig",
      referrer: "android-app://com.instagram.android",
    }),
  });
  const utm = ctx.api.forSubmit();
  assert.equal(Object.hasOwn(utm, "referrer"), false);
  assert.equal(Object.hasOwn(utm, "first_referrer"), false);
});

test("teto do jsonb encolhe valores e corta chaves do fim quando o texto passa do limite", () => {
  const ctx = setup({
    jsonMax: 180,
    page: page({
      href: "https://viralmindlabs.com/?utm_source=" + "s".repeat(200) + "&utm_medium=" + "m".repeat(200) + "&utm_campaign=" + "c".repeat(200),
      search: "?utm_source=" + "s".repeat(200) + "&utm_medium=" + "m".repeat(200) + "&utm_campaign=" + "c".repeat(200),
    }),
  });
  const utm = ctx.api.forSubmit();
  assert.ok(JSON.stringify(utm).length <= 180);
  assert.ok(utm.utm_source.length < 200);
  assert.ok(utm.utm_source.startsWith("s"));
  assert.equal(Object.hasOwn(utm, "first_ts"), false);
});

test("leitura descarta query de landing e referrer e chaves fora da lista", () => {
  const ctx = setup({
    page: page({
      href: "https://viralmindlabs.com/aplicar",
      pathname: "/aplicar",
      search: "",
    }),
  });
  ctx.storage.setItem(STORAGE_KEY, JSON.stringify({
    first: {
      utm_source: "google",
      landing_page: "https://viralmindlabs.com/?utm_source=google",
      referrer: "https://www.google.com/search?q=segredo",
      ts: "2026-10-01T00:00:00.000Z",
      email: "a@b.c",
    },
    last: {
      utm_source: "google",
      landing_page: "https://viralmindlabs.com/?utm_source=google",
      referrer: "https://www.google.com/search?q=segredo",
      ts: "2026-10-01T00:00:00.000Z",
      email: "a@b.c",
    },
  }));
  const utm = ctx.api.forSubmit();
  assert.equal(utm.utm_source, "google");
  assert.equal(utm.landing_page, "https://viralmindlabs.com/");
  assert.equal(utm.referrer, "https://www.google.com/search");
  assert.equal(utm.first_referrer, "https://www.google.com/search");
  assert.equal(Object.hasOwn(utm, "email"), false);
});

test("payload dos outros campos do formulário permanece o mesmo", () => {
  const src = fs.readFileSync(path.join(__dirname, "aplicar/aplicar.js"), "utf8");
  const payload = src.slice(src.indexOf("function payload()"), src.indexOf("async function submitApp"));
  for (const field of ["nome", "email", "ddi", "whatsapp", "empresa", "ramo", "instagram", "faturamento", "obs", "consent", "user_agent", "utm"]) {
    assert.match(payload, new RegExp(field + ":"));
  }
  assert.match(src, /utm: readUtm\(\)/);
  assert.match(src, /window\.VMLAttribution/);
});

test("html da home e de /aplicar carregam attribution.js com versão", () => {
  const home = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const form = fs.readFileSync(path.join(__dirname, "aplicar/index.html"), "utf8");
  assert.equal(home.match(/href="\/aplicar"/g).length, 3);
  assert.match(home, /src="\/attribution\.js\?v=15"/);
  assert.match(form, /src="\/attribution\.js\?v=15"/);
  assert.match(form, /src="aplicar\.js\?v=15"/);
  assert.ok(form.indexOf("/attribution.js?v=15") < form.indexOf("aplicar.js?v=15"));
});

function campaignPage(search, extra) {
  return page(Object.assign({ href: "https://viralmindlabs.com/" + search, search }, extra));
}

function visit(ctx, search, pathname) {
  ctx.page.pathname = pathname || "/";
  ctx.page.href = "https://viralmindlabs.com" + ctx.page.pathname + search;
  ctx.page.search = search;
}

test("utm_id e utm_foo entram no first, no last e no jsonb", () => {
  const ctx = setup({ page: campaignPage("?utm_source=ig&utm_id=123&utm_foo=bar") });
  const stored = ctx.api.capture();
  assert.equal(stored.last.utm_id, "123");
  assert.equal(stored.last.utm_foo, "bar");
  assert.equal(ctx.api.readStore().first.utm_id, "123");
  assert.equal(ctx.api.readStore().last.utm_foo, "bar");
  const utm = ctx.api.forSubmit();
  assert.equal(utm.utm_id, "123");
  assert.equal(utm.utm_foo, "bar");
  assert.equal(utm.first_utm_id, "123");
  assert.equal(utm.first_utm_foo, "bar");
});

test("só utm_id já conta como campanha e troca o last", () => {
  const ctx = setup({ page: campaignPage("?utm_source=ig") });
  ctx.api.capture();
  visit(ctx, "?utm_id=abc");
  const utm = ctx.api.forSubmit();
  assert.equal(utm.utm_id, "abc");
  assert.equal(Object.hasOwn(utm, "utm_source"), false);
  assert.equal(utm.first_utm_source, "ig");
});

test("mudar só uma chave genérica é outra campanha, mesmo em /aplicar", () => {
  const ctx = setup({ page: campaignPage("?utm_source=ig&utm_id=1") });
  ctx.api.capture();
  visit(ctx, "?utm_source=ig&utm_id=2", "/aplicar");
  const utm = ctx.api.forSubmit();
  assert.equal(utm.utm_id, "2");
  assert.equal(utm.landing_page, "https://viralmindlabs.com/aplicar");
});

test("matcher aceita chave de até 40 caracteres e rejeita o resto", () => {
  const longest = "utm_" + "a".repeat(36);
  assert.equal(longest.length, 40);
  assert.equal(isCampaignKey(longest), true);
  assert.equal(isCampaignKey(longest + "a"), false);
  assert.equal(isCampaignKey("utm_"), false);
  assert.equal(isCampaignKey("UTM_SOURCE"), false);
  assert.equal(isCampaignKey("utm_a-b"), false);
  assert.equal(isCampaignKey("gclid"), true);
  assert.equal(isCampaignKey("fbclid"), true);
  assert.equal(isCampaignKey("msclkid"), false);
});

test("chave com mais de 40 caracteres fica de fora e não conta como campanha", () => {
  const tooLong = "utm_" + "a".repeat(37);
  const ctx = setup({ page: campaignPage("?utm_source=ig") });
  ctx.api.capture();
  visit(ctx, "?" + tooLong + "=x");
  const utm = ctx.api.forSubmit();
  assert.equal(Object.hasOwn(utm, tooLong), false);
  assert.equal(utm.utm_source, "ig");
});

test("teto de 20 chaves por toque, na captura e na leitura do storage", () => {
  assert.equal(CAMPAIGN_KEYS_MAX, 20);
  const extras = Array.from({ length: 25 }, (_, i) => "utm_x" + i + "=v" + i);
  const search = "?" + extras.join("&") + "&fbclid=fb&gclid=gc&utm_source=ig";
  const ctx = setup({ page: campaignPage(search) });
  const stored = ctx.api.capture();
  const count = (touch) => Object.keys(touch).filter(isCampaignKey).length;
  assert.equal(count(stored.first), 20);
  assert.equal(stored.first.utm_source, "ig");
  assert.equal(stored.first.gclid, "gc");
  assert.equal(stored.first.fbclid, "fb");
  assert.equal(stored.first.utm_x16, "v16");
  assert.equal(Object.hasOwn(stored.first, "utm_x17"), false);

  const raw = { ts: new Date(T0).toISOString() };
  for (let i = 0; i < 25; i++) raw["utm_y" + i] = "v";
  const other = setup();
  other.storage.setItem(STORAGE_KEY, JSON.stringify({ first: raw, last: raw }));
  assert.equal(count(other.api.readStore().last), 20);
});

test("chave repetida ou vazia não gasta o teto de 20", () => {
  const repeated = Array.from({ length: 30 }, () => "utm_a=1").join("&");
  const empty = Array.from({ length: 30 }, (_, i) => "utm_e" + i + "=").join("&");
  const ctx = setup({ page: campaignPage("?" + repeated + "&" + empty + "&utm_b=2") });
  const stored = ctx.api.capture();
  assert.equal(stored.last.utm_a, "1");
  assert.equal(stored.last.utm_b, "2");
  assert.equal(Object.hasOwn(stored.last, "utm_e0"), false);
});

test("valor genérico é cortado em 200 caracteres", () => {
  const ctx = setup({ page: campaignPage("?utm_foo=" + "f".repeat(240)) });
  const utm = ctx.api.forSubmit();
  assert.equal(utm.utm_foo.length, 200);
  assert.equal(utm.first_utm_foo.length, 200);
  assert.equal(ctx.api.readStore().last.utm_foo.length, 200);
});

test("jsonb com 20 chaves longas nos dois toques respeita o teto padrão", () => {
  const keys = Array.from({ length: 20 }, (_, i) => "utm_" + String(i).padStart(36, "k"));
  const search = "?" + keys.map((key) => key + "=" + "v".repeat(200)).join("&");
  const ctx = setup({ page: campaignPage(search) });
  const utm = ctx.api.forSubmit();
  assert.ok(JSON.stringify(utm).length <= 4800);
  assert.ok(utm[keys[0]].startsWith("v"));
});

test("visita sem campanha mantém o last inteiro", () => {
  const ctx = setup({
    page: campaignPage("?utm_source=ig&utm_id=1", { referrer: "https://l.instagram.com/" }),
  });
  ctx.api.capture();
  const before = ctx.api.readStore().last;
  ctx.now = T0 + 5 * 24 * 60 * 60 * 1000;
  visit(ctx, "", "/sobre");
  ctx.page.referrer = "https://www.google.com/";
  ctx.api.capture();
  assert.deepEqual(ctx.api.readStore().last, before);
  const utm = ctx.api.forSubmit();
  assert.equal(utm.utm_source, "ig");
  assert.equal(utm.utm_id, "1");
  assert.equal(utm.landing_page, "https://viralmindlabs.com/");
  assert.equal(utm.referrer, "https://l.instagram.com/");
  assert.equal(utm.ts, "2026-10-30T08:00:00.000Z");
});

test("visita sem campanha depois de 90 dias renova o first e mantém o last", () => {
  const ctx = setup({ page: campaignPage("?utm_source=ig&utm_id=1") });
  ctx.api.capture();
  ctx.now = T0 + FIRST_TTL_MS;
  visit(ctx, "", "/");
  const utm = ctx.api.forSubmit();
  assert.equal(utm.utm_source, "ig");
  assert.equal(utm.utm_id, "1");
  assert.equal(utm.ts, "2026-10-30T08:00:00.000Z");
  assert.equal(Object.hasOwn(utm, "first_utm_source"), false);
  assert.equal(utm.first_ts, new Date(ctx.now).toISOString());
  assert.equal(ctx.api.decorateHref("/aplicar"), "/aplicar?utm_source=ig&utm_id=1");
});

test("link para /aplicar leva utm_id e chaves genéricas, da URL e do storage", () => {
  const ctx = setup({ page: campaignPage("?utm_source=ig&utm_id=123&utm_foo=bar") });
  ctx.api.capture();
  const expected = "/aplicar?utm_source=ig&utm_id=123&utm_foo=bar";
  assert.equal(ctx.api.decorateHref("/aplicar"), expected);
  visit(ctx, "");
  assert.equal(ctx.api.decorateHref("/aplicar"), expected);
});

test("link para /aplicar troca chaves de campanha antigas e preserva as outras", () => {
  const ctx = setup({ page: campaignPage("?utm_source=ig") });
  ctx.api.capture();
  assert.equal(
    ctx.api.decorateHref("/aplicar?utm_id=velho&utm_foo=velho&utm_source=velho&gclid=velho&plano=a"),
    "/aplicar?plano=a&utm_source=ig"
  );
});

test("passagem por link com chaves genéricas não vira nova campanha em /aplicar", () => {
  const ctx = setup({
    page: campaignPage("?utm_id=1&utm_source=ig", { referrer: "https://l.instagram.com/" }),
  });
  ctx.api.capture();
  const next = ctx.api.decorateHref("/aplicar");
  visit(ctx, next.slice(next.indexOf("?")), "/aplicar");
  ctx.page.referrer = "https://viralmindlabs.com/";
  const utm = ctx.api.forSubmit();
  assert.equal(utm.utm_id, "1");
  assert.equal(utm.landing_page, "https://viralmindlabs.com/");
  assert.equal(utm.referrer, "https://l.instagram.com/");
});

// Normalização da query (links do OpenInApp chegam com &amp; no lugar de &).

const OPENINAPP_URL = "https://viralmindlabs.com/?utm_source=reels&amp;utm_medium=instagram&amp;utm_content=igorbevilaqua";
const CID = "Ab3dEf7hIj9kLm1n";

function readAll(search) {
  const params = readQuery(search);
  const out = {};
  params.keys.forEach((key) => { out[key] = params.get(key); });
  return out;
}

test("readQuery desfaz &amp;, &#38; e &#x26; e tira o prefixo amp; das chaves", () => {
  const expected = { utm_source: "reels", utm_medium: "instagram", utm_content: "igorbevilaqua" };
  assert.deepEqual(readAll("?utm_source=reels&amp;utm_medium=instagram&amp;utm_content=igorbevilaqua"), expected);
  assert.deepEqual(readAll("?utm_source=reels&amp;amp;utm_medium=instagram&amp;utm_content=igorbevilaqua"), expected);
  assert.deepEqual(readAll("?utm_source=a&amp;amp;amp;utm_medium=b"), { utm_source: "a", utm_medium: "b" });
  assert.deepEqual(readAll("?utm_source=a&AMP;UTM_MEDIUM=b"), { utm_source: "a", utm_medium: "b" });
  assert.deepEqual(readAll("?amp;utm_medium=b"), { utm_medium: "b" });
  assert.deepEqual(readAll("?utm_source=a&amp;GCLID=g&amp;FbClid=f"), { utm_source: "a", gclid: "g", fbclid: "f" });
});

test("readQuery: %26 é parte do valor, maiúsculas do valor ficam e a primeira não vazia vence", () => {
  assert.deepEqual(readAll("?utm_content=a%26b&utm_source=x"), { utm_content: "a&b", utm_source: "x" });
  assert.deepEqual(readAll("?utm_content=igorbevilaqua.DAbC123xyz"), { utm_content: "igorbevilaqua.DAbC123xyz" });
  assert.deepEqual(readAll("?utm_source=x&utm_source=y"), { utm_source: "x" });
  assert.deepEqual(readAll("?utm_source=&utm_source=y"), { utm_source: "y" });
  assert.deepEqual(readAll("?utm_source=x&amp;utm_source=y&amp;amp;utm_source=z"), { utm_source: "x" });
  assert.deepEqual(readAll("?utm_source=%20%20&UTM_SOURCE=y"), { utm_source: "y" });
  assert.doesNotThrow(() => readAll("?utm_source=%E0%A4%A"));
  assert.ok(readAll("?utm_source=%E0%A4%A").utm_source);
});

test("readQuery nunca lê o hash, nem quando &#38; ou &#x26; abrem o hash", () => {
  // Numa URL de verdade o # de &#38; começa o hash, então o resto não é lido.
  const url = new URL("https://viralmindlabs.com/?utm_source=reels&#38;utm_medium=instagram");
  assert.equal(url.search, "?utm_source=reels&");
  assert.deepEqual(readAll(url.search), { utm_source: "reels" });
  assert.deepEqual(readAll("?utm_source=reels&#x26;utm_medium=instagram"), { utm_source: "reels" });
  assert.deepEqual(readAll("?utm_source=x#utm_medium=y"), { utm_source: "x" });
  assert.deepEqual(readAll("#utm_source=x"), {});
  const ctx = setup({ page: campaignPage("?utm_source=x", { href: "https://viralmindlabs.com/?utm_source=x#utm_medium=y" }) });
  const utm = ctx.api.forSubmit();
  assert.equal(utm.utm_source, "x");
  assert.equal(Object.hasOwn(utm, "utm_medium"), false);
});

test("captura com &amp; e espaços: valor com espaço nas pontas é aparado e longo é cortado em 200", () => {
  const ctx = setup({ page: campaignPage("?utm_source=%20x%20&amp;utm_content=" + "c".repeat(500)) });
  const utm = ctx.api.forSubmit();
  assert.equal(utm.utm_source, "x");
  assert.equal(utm.utm_content.length, 200);
});

test("chave de campanha em maiúsculas vira minúscula", () => {
  const ctx = setup({ page: campaignPage("?UTM_Source=ig&Utm_Medium=bio") });
  const utm = ctx.api.forSubmit();
  assert.equal(utm.utm_source, "ig");
  assert.equal(utm.utm_medium, "bio");
});

test("vml_cid válido entra no last, no first, no jsonb e no link para /aplicar", () => {
  const ctx = setup({ page: campaignPage("?utm_source=reels&vml_cid=" + CID) });
  const stored = ctx.api.capture();
  assert.equal(stored.last.vml_cid, CID);
  assert.equal(stored.first.vml_cid, CID);
  assert.equal(ctx.api.readStore().last.vml_cid, CID);
  assert.equal(ctx.api.decorateHref("/aplicar"), "/aplicar?utm_source=reels&vml_cid=" + CID);
  const utm = ctx.api.forSubmit();
  assert.equal(utm.vml_cid, CID);
  assert.equal(utm.first_vml_cid, CID);
  assert.equal(isCampaignKey("vml_cid"), true);
});

test("vml_cid fora do formato é descartado, na URL e no storage", () => {
  for (const bad of ["curto", "Ab3dEf7hIj9kLm1n2", "Ab3dEf7hIj9kLm1-", "Ab3dEf7h Ij9kLm1"]) {
    const ctx = setup({ page: campaignPage("?utm_source=ig&vml_cid=" + encodeURIComponent(bad)) });
    const utm = ctx.api.forSubmit();
    assert.equal(Object.hasOwn(utm, "vml_cid"), false, bad);
    assert.equal(utm.utm_source, "ig");
  }
  const only = setup({ page: campaignPage("?vml_cid=lixo") });
  assert.equal(Object.hasOwn(only.api.forSubmit(), "utm_source"), false);
  assert.equal(only.api.readStore().last.vml_cid, undefined);

  const ctx = setup();
  ctx.storage.setItem(STORAGE_KEY, JSON.stringify({
    first: { utm_source: "ig", vml_cid: "lixo", ts: new Date(T0).toISOString() },
    last: { utm_source: "ig", vml_cid: CID, ts: new Date(T0).toISOString() },
  }));
  assert.equal(ctx.api.readStore().first.vml_cid, undefined);
  assert.equal(ctx.api.readStore().last.vml_cid, CID);
});

test("vml_cid inválido não esconde um válido que vem depois", () => {
  assert.deepEqual(readAll("?vml_cid=lixo&amp;vml_cid=" + CID), { vml_cid: CID });
});

test("outro vml_cid com a mesma utm é outro clique e troca o last, mesmo em /aplicar", () => {
  const ctx = setup({ page: campaignPage("?utm_source=reels&vml_cid=" + CID) });
  ctx.api.capture();
  const other = "Zz9yXx8wVv7uTt6s";
  ctx.now = T0 + 1000;
  visit(ctx, "?utm_source=reels&vml_cid=" + other, "/aplicar");
  const utm = ctx.api.forSubmit();
  assert.equal(utm.vml_cid, other);
  assert.equal(utm.first_vml_cid, CID);
  assert.equal(utm.landing_page, "https://viralmindlabs.com/aplicar");
});

function aplicarReadUtm(win) {
  const src = fs.readFileSync(path.join(__dirname, "aplicar/aplicar.js"), "utf8");
  const body = src.slice(src.indexOf("function readUtm()"), src.indexOf("function configReady"));
  const utm = vm.runInNewContext(body + "\nreadUtm();", { window: win, URLSearchParams });
  return utm === null ? null : JSON.parse(JSON.stringify(utm));
}

test("ponta a ponta: URL do OpenInApp com &amp; chega inteira ao utm que /aplicar envia", () => {
  const url = new URL(OPENINAPP_URL + "&amp;vml_cid=" + CID);
  const ctx = setup({ page: campaignPage(url.search, { href: url.href, referrer: "https://l.instagram.com/" }) });
  ctx.api.start();
  const cta = link("/aplicar");
  ctx.links.push(cta);
  ctx.api.decorateDocument();
  assert.equal(cta.href, "/aplicar?utm_source=reels&utm_medium=instagram&utm_content=igorbevilaqua&vml_cid=" + CID);

  ctx.now = T0 + 60000;
  visit(ctx, cta.href.slice(cta.href.indexOf("?")), "/aplicar");
  const utm = aplicarReadUtm({ VMLAttribution: { forSubmit: ctx.api.forSubmit }, location: { search: ctx.page.search } });
  assert.equal(utm.utm_source, "reels");
  assert.equal(utm.utm_medium, "instagram");
  assert.equal(utm.utm_content, "igorbevilaqua");
  assert.equal(utm.vml_cid, CID);
  assert.equal(utm.first_utm_medium, "instagram");
  assert.equal(utm.first_utm_content, "igorbevilaqua");
  assert.equal(utm.first_vml_cid, CID);
  assert.equal(utm.landing_page, "https://viralmindlabs.com/");
  assert.equal(utm.referrer, "https://l.instagram.com/");
  for (const key of Object.keys(utm)) assert.doesNotMatch(key, /amp;/);
});

test("ponta a ponta: URL exata do OpenInApp, sem vml_cid, direto em /aplicar", () => {
  const url = new URL(OPENINAPP_URL.replace("viralmindlabs.com/", "viralmindlabs.com/aplicar"));
  const ctx = setup({ page: campaignPage(url.search, { href: url.href, pathname: "/aplicar" }) });
  const utm = aplicarReadUtm({ VMLAttribution: { forSubmit: ctx.api.forSubmit }, location: { search: url.search } });
  assert.equal(utm.utm_source, "reels");
  assert.equal(utm.utm_medium, "instagram");
  assert.equal(utm.utm_content, "igorbevilaqua");
  assert.equal(Object.hasOwn(utm, "vml_cid"), false);
});

test("fallback do /aplicar sem attribution.js trata &amp; e vml_cid", () => {
  const search = new URL(OPENINAPP_URL + "&amp;vml_cid=" + CID + "&amp;amp;UTM_TERM=t&amp;utm_source=outro&email=x@y.com").search;
  assert.deepEqual(aplicarReadUtm({ location: { search } }), {
    utm_source: "reels",
    utm_medium: "instagram",
    utm_content: "igorbevilaqua",
    vml_cid: CID,
    utm_term: "t",
  });
  assert.deepEqual(aplicarReadUtm({ location: { search: "?utm_source=&utm_source=y&vml_cid=lixo&utm_content=a%26b" } }), {
    utm_source: "y",
    utm_content: "a&b",
  });
  assert.equal(aplicarReadUtm({ location: { search: "?vml_cid=lixo#utm_source=x" } }), null);
  assert.deepEqual(aplicarReadUtm({ location: { search: "?utm_source=ig&utm_medium=bio" } }), { utm_source: "ig", utm_medium: "bio" });
});

// Script inline do <head> que limpa a URL antes do Clarity.

function headScript(file) {
  const html = fs.readFileSync(path.join(__dirname, file), "utf8");
  const head = html.slice(0, html.indexOf("</head>"));
  const start = head.indexOf("<script>\n  // Links do OpenInApp");
  assert.ok(start !== -1, file);
  const end = head.indexOf("</script>", start);
  return { html: head, start, code: head.slice(start + "<script>".length, end) };
}

function runHead(search, hash, opts) {
  const calls = [];
  const history = {
    replaceState(state, title, url) {
      if (opts && opts.fail) throw new Error("SecurityError");
      calls.push(url);
    },
  };
  const location = { search, hash: hash || "", pathname: (opts && opts.pathname) || "/" };
  vm.runInNewContext(headScript("index.html").code, { location, history });
  return calls;
}

test("script do head é o mesmo nas duas páginas e vem antes do Clarity", () => {
  const home = headScript("index.html");
  const form = headScript("aplicar/index.html");
  assert.equal(home.code, form.code);
  for (const page of [home, form]) {
    assert.ok(page.start < page.html.indexOf("clarity.ms"));
  }
});

test("script do head limpa a URL do OpenInApp e preserva caminho e hash", () => {
  const search = new URL(OPENINAPP_URL).search;
  assert.deepEqual(runHead(search), ["/?utm_source=reels&utm_medium=instagram&utm_content=igorbevilaqua"]);
  assert.deepEqual(runHead(search + "&amp;vml_cid=" + CID, "#metodo", { pathname: "/aplicar" }), [
    "/aplicar?utm_source=reels&utm_medium=instagram&utm_content=igorbevilaqua&vml_cid=" + CID + "#metodo",
  ]);
  assert.deepEqual(runHead("?utm_source=a&amp;amp;amp;utm_medium=b"), ["/?utm_source=a&utm_medium=b"]);
  assert.deepEqual(runHead("?utm_source=a&AMP;UTM_MEDIUM=b"), ["/?utm_source=a&utm_medium=b"]);
  // Só alcançável se a query chegar com o # literal; o navegador manda isso para o hash.
  assert.deepEqual(runHead("?utm_source=a&#38;utm_medium=b&#x26;utm_term=c"), ["/?utm_source=a&utm_medium=b&utm_term=c"]);
  assert.deepEqual(runHead("?amp;utm_medium=b"), ["/?utm_medium=b"]);
  assert.deepEqual(runHead("?utm_source=&amp;utm_source=y&amp;utm_source=z"), ["/?utm_source=y"]);
  assert.deepEqual(runHead("?utm_content=a%26b&amp;utm_source=x"), ["/?utm_content=a%26b&utm_source=x"]);
  assert.deepEqual(runHead("?utm_content=igorbevilaqua.DAbC123xyz&amp;utm_source=x"), ["/?utm_content=igorbevilaqua.DAbC123xyz&utm_source=x"]);
  assert.deepEqual(runHead("?utm_source=%E0%A4%A&amp;utm_medium=b"), ["/?utm_source=%E0%A4%A&utm_medium=b"]);
});

test("script do head não mexe em URL limpa nem lê o hash", () => {
  assert.deepEqual(runHead(""), []);
  assert.deepEqual(runHead("?utm_source=reels&utm_medium=instagram&utm_content=igorbevilaqua"), []);
  assert.deepEqual(runHead("?UTM_SOURCE=x&utm_source=y"), []);
  assert.deepEqual(runHead("?utm_source=x", "#a=1&amp;utm_medium=y"), []);
  assert.deepEqual(runHead("?utm_source=a&", "#38;utm_medium=b"), []);
  assert.deepEqual(runHead("?utm_source=x&amp;utm_medium=y", "#utm_campaign=z&amp;b=1"), ["/?utm_source=x&utm_medium=y#utm_campaign=z&amp;b=1"]);
});

test("script do head não quebra a página se replaceState falhar", () => {
  assert.doesNotThrow(() => runHead("?utm_source=x&amp;utm_medium=y", "", { fail: true }));
});

test("query limpa pelo head e query crua dão o mesmo utm no envio", () => {
  const raw = new URL(OPENINAPP_URL + "&amp;vml_cid=" + CID).search;
  const cleaned = runHead(raw)[0].slice(1);
  const a = setup({ page: campaignPage(raw) }).api.forSubmit();
  const b = setup({ page: campaignPage(cleaned) }).api.forSubmit();
  for (const key of ["landing_page", "first_landing_page"]) {
    delete a[key];
    delete b[key];
  }
  assert.deepEqual(a, b);
  assert.equal(b.utm_medium, "instagram");
});
