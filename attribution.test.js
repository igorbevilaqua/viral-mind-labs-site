const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { create, VALUE_MAX, FIRST_TTL_MS, STORAGE_KEY, CAMPAIGN_KEYS_MAX, isCampaignKey } = require("./attribution.js");

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
      href: "https://viralmindlabs.com/?utm_source=ig&email=pessoa@x.com&utm_Foo=nao",
      search: "?utm_source=ig&email=pessoa@x.com&utm_Foo=nao",
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
  assert.match(home, /src="\/attribution\.js\?v=14"/);
  assert.match(form, /src="\/attribution\.js\?v=14"/);
  assert.match(form, /src="aplicar\.js\?v=14"/);
  assert.ok(form.indexOf("/attribution.js?v=14") < form.indexOf("aplicar.js?v=14"));
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
