(() => {
  "use strict";

  const STEPS = [
    "welcome",
    "nome",
    "email",
    "whatsapp",
    "empresa",
    "papel",
    "faturamento",
    "produto_servico",
    "instagram",
    "reconhecido",
    "inspiracoes",
    "publico_desejado",
    "consent",
    "success",
  ];
  const TEXT_FIELDS = ["nome", "email", "empresa", "papel", "produto_servico", "instagram"];
  const TEXTAREAS = ["reconhecido", "publico_desejado"];
  // Textareas opcionais: mesmo comportamento de teclado, sem exigir resposta.
  const OPTIONAL_TEXTAREAS = ["inspiracoes"];
  const TABLE = "site_master_plan_applications";

  // Texto da tela de sucesso. O final do parágrafo ainda será confirmado com o Igor.
  // Para alterar, edite só este objeto. Se mudar depois do merge, suba o ?v= do
  // masterplan.js em index.html para o cache não servir o texto antigo.
  const SUCCESS_COPY = {
    title: "Masterplan VM",
    subtitle: "Respostas enviadas",
    body: "Suas informações já foram enviadas para o nosso time de estratégia. Em até 7 dias você receberá a análise e o plano de viralização de autoridade, baseado no seu perfil e no seu objetivo de crescimento.",
  };

  function applySuccessCopy() {
    const title = document.getElementById("success-title");
    const subtitle = document.getElementById("success-subtitle");
    const body = document.getElementById("success-body");
    if (title) title.textContent = SUCCESS_COPY.title;
    if (subtitle) subtitle.textContent = SUCCESS_COPY.subtitle;
    if (body) body.textContent = SUCCESS_COPY.body;
  }


  const form = document.getElementById("apply-form");
  const viewport = form;
  const progress = document.getElementById("progress");
  const pager = document.getElementById("pager");
  const prevBtn = document.getElementById("prev");
  const nextBtn = document.getElementById("next");
  const live = document.getElementById("live");
  const ddiSelect = document.getElementById("ddi");
  const telInput = document.getElementById("whatsapp");
  const sendBtn = document.getElementById("send");
  const fatPicker = document.getElementById("fat-picker");
  const fatTrigger = document.getElementById("fat-trigger");
  const fatPanel = document.getElementById("fat-panel");
  const fatLabel = document.getElementById("fat-label");
  const fatValue = document.getElementById("faturamento");

  const motionOk = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const state = { index: 0, lock: false, sending: false, fat: "", queued: null, dest: 0 };

  const soDigitos = (s) => String(s || "").replace(/\D/g, "");
  const ehBrasil = () => ddiSelect.value === "55";

  function flag(iso) {
    return String(iso || "").toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
  }

  function fillCountries() {
    const groups = window.VML_COUNTRIES || [];
    groups.forEach((group) => {
      const og = document.createElement("optgroup");
      og.label = group.label;
      (group.items || []).forEach((item) => {
        const opt = document.createElement("option");
        opt.value = item.ddi;
        opt.dataset.iso = item.iso;
        opt.textContent = flag(item.iso) + " " + item.name + " +" + item.ddi;
        if (item.iso === "BR" && group.label === "Mais comuns") opt.selected = true;
        og.appendChild(opt);
      });
      ddiSelect.appendChild(og);
    });
  }

  function mascaraBR(d) {
    if (d.length <= 2) return d.length ? "(" + d : "";
    const ddd = d.slice(0, 2);
    const resto = d.slice(2, 11);
    if (!resto) return "(" + ddd + ") ";
    const corte = resto.length > 8 ? 5 : 4;
    return resto.length <= corte ? "(" + ddd + ") " + resto : "(" + ddd + ") " + resto.slice(0, corte) + "-" + resto.slice(corte);
  }

  function telValido() {
    const n = soDigitos(telInput.value).length;
    return ehBrasil() ? n === 10 || n === 11 : n >= 6 && n <= 15;
  }

  const emailValido = () => /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-zA-Z]{2,}$/.test(document.getElementById("email").value.trim());

  let liveGen = 0;

  function controlFor(name) {
    if (name === "faturamento") return fatTrigger;
    if (name === "consent") return document.getElementById("ciente");
    return document.getElementById(name);
  }

  function announce(msg) {
    const gen = ++liveGen;
    if (!msg) {
      live.textContent = "";
      return;
    }
    if (live.textContent === msg) {
      live.textContent = "";
      window.requestAnimationFrame(() => {
        if (gen === liveGen) live.textContent = msg;
      });
      return;
    }
    live.textContent = msg;
  }

  function showErr(name, msg, fromAttempt) {
    const el = form.querySelector('[data-err="' + name + '"]');
    const field = controlFor(name);
    if (field && name !== "faturamento" && name !== "consent") field.classList.toggle("invalid", !!msg);
    if (name === "faturamento") fatPicker.classList.toggle("is-invalid", !!msg);
    if (field) {
      field.setAttribute("aria-invalid", msg ? "true" : "false");
      if (el && el.id) {
        if (msg) field.setAttribute("aria-describedby", el.id);
        else field.removeAttribute("aria-describedby");
      }
    }
    if (!el) return;
    if (msg) {
      const fresh = el.hidden || el.textContent !== msg;
      el.hidden = false;
      el.textContent = msg;
      if (fresh || fromAttempt) {
        announce(msg);
        if (field && document.activeElement !== field) field.focus({ preventScroll: true });
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    } else {
      el.hidden = true;
      el.textContent = "";
      announce("");
    }
  }

  function clearErr(name) {
    showErr(name, "");
  }

  function nomeMensagem(value) {
    const parts = String(value || "").trim().split(/\s+/).filter((part) => /\p{L}/u.test(part));
    return parts.length >= 2 ? "" : "Digite nome e sobrenome.";
  }

  function validate(name, report) {
    let msg = "";
    if (name === "nome") {
      msg = nomeMensagem(document.getElementById("nome").value);
    } else if (name === "email" && !emailValido()) {
      msg = "Informe um e-mail válido, com domínio completo (ex.: nome@empresa.com.br).";
    } else if (name === "whatsapp" && !telValido()) {
      msg = ehBrasil()
        ? "Informe DDD + número (10 ou 11 dígitos)."
        : "Informe o número completo do país selecionado.";
    } else if (name === "faturamento" && !state.fat) {
      msg = "Selecione uma faixa de faturamento.";
    } else if (name === "papel" && !document.getElementById("papel").value.trim()) {
      msg = "Informe o seu papel na empresa.";
    } else if (name === "empresa" && !document.getElementById("empresa").value.trim()) {
      msg = "Informe o nome da sua empresa.";
    } else if (name === "produto_servico" && !document.getElementById("produto_servico").value.trim()) {
      msg = "Informe o produto ou serviço que a sua empresa vende.";
    } else if (TEXTAREAS.indexOf(name) !== -1 && !document.getElementById(name).value.trim()) {
      msg = "Responda esta pergunta para continuar.";
    } else if (name === "consent" && !document.getElementById("ciente").checked) {
      msg = "Para enviar, é necessário confirmar que está ciente das condições acima.";
    }
    if (report) showErr(name, msg, report === true);
    else if (!msg) clearErr(name);
    return !msg;
  }

  function stepName() {
    return STEPS[state.index];
  }

  function stepEl(i) {
    return form.querySelector('[data-step="' + STEPS[i] + '"]');
  }

  function place(el, cls, animate) {
    if (!animate) el.style.transition = "none";
    el.classList.remove("is-current", "is-above", "is-below");
    if (cls) el.classList.add(cls);
    if (!animate) {
      void el.offsetHeight;
      el.style.transition = "";
    }
  }

  function syncChrome() {
    const last = STEPS.length - 1;
    progress.style.width = (state.index / last) * 100 + "%";
    const onQuestion = state.index > 0 && state.index < last;
    pager.hidden = !onQuestion;
    prevBtn.disabled = state.index <= 0;
    nextBtn.disabled = state.sending;
    STEPS.forEach((_, i) => {
      const el = stepEl(i);
      const on = i === state.index;
      el.setAttribute("aria-hidden", on ? "false" : "true");
      if ("inert" in el) el.inert = !on;
    });
  }

  function focusCurrent() {
    const el = stepEl(state.index);
    const target = el.querySelector("input.line, textarea.line, select.line, .picker-trigger, .btn");
    if (target && !target.disabled) target.focus({ preventScroll: true });
  }

  function go(next, dir) {
    if (next < 0 || next >= STEPS.length || next === state.index) return;
    if (state.lock) {
      if (next !== state.dest) state.queued = { next: next, dir: dir };
      return;
    }
    const from = stepEl(state.index);
    const to = stepEl(next);
    state.dest = next;
    state.lock = true;
    viewport.classList.add("is-animating");
    place(to, dir > 0 ? "is-below" : "is-above", false);
    window.requestAnimationFrame(() => {
      place(from, dir > 0 ? "is-above" : "is-below", true);
      place(to, "is-current", true);
      state.index = next;
      syncChrome();
      window.setTimeout(() => {
        state.lock = false;
        viewport.classList.remove("is-animating");
        const queued = state.queued;
        state.queued = null;
        if (queued && queued.next !== state.index) go(queued.next, queued.dir);
        else if (stepName() !== "success") focusCurrent();
      }, motionOk ? 540 : 0);
    });
  }

  function shake() {
    const col = stepEl(state.index).querySelector(".col");
    col.classList.remove("shake");
    void col.offsetWidth;
    col.classList.add("shake");
  }

  function advance() {
    if (state.sending) return;
    const name = stepName();
    if (name === "welcome") {
      go(1, 1);
      return;
    }
    if (name === "success") return;
    if (name === "consent") {
      submitApp();
      return;
    }
    if (!validate(name, true)) {
      shake();
      return;
    }
    go(state.index + 1, 1);
  }

  function back() {
    if (state.sending || state.index <= 0 || stepName() === "success") return;
    closeFat(false);
    go(state.index - 1, -1);
  }

  function readUtm() {
    if (window.VMLAttribution && typeof window.VMLAttribution.forSubmit === "function") {
      return window.VMLAttribution.forSubmit();
    }
    let query = String(window.location.search || "");
    for (let i = 0; i < 5; i++) {
      const next = query.replace(/&(amp|#38|#x26);/gi, "&");
      if (next === query) break;
      query = next;
    }
    const params = new URLSearchParams(query);
    const utm = {};
    let count = 0;
    params.forEach((value, rawKey) => {
      let key = rawKey.trim();
      while (/^amp;/i.test(key)) key = key.slice(4).trim();
      if (/^(utm_|gclid$|fbclid$|vml_cid$)/i.test(key)) key = key.toLowerCase();
      const known = key === "gclid" || key === "fbclid" || key === "vml_cid" || /^utm_[a-z0-9_]{1,36}$/.test(key);
      if (!known || utm[key] || count >= 20) return;
      const clean = value.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 200);
      if (!clean || (key === "vml_cid" && !/^[A-Za-z0-9]{16}$/.test(clean))) return;
      utm[key] = clean;
      count++;
    });
    return Object.keys(utm).length ? utm : null;
  }

  function configReady() {
    const cfg = window.VML_SUPABASE;
    if (!cfg || !cfg.url || !cfg.anonKey) return false;
    if (String(cfg.url).indexOf("YOUR_PROJECT") !== -1) return false;
    if (String(cfg.anonKey).indexOf("YOUR_") !== -1) return false;
    return true;
  }

  function payload() {
    const ddi = ddiSelect.value;
    return {
      nome: document.getElementById("nome").value.trim(),
      email: document.getElementById("email").value.trim(),
      ddi: ddi,
      whatsapp: ("+" + ddi + " " + telInput.value.trim()).trim(),
      faturamento: state.fat,
      papel: document.getElementById("papel").value.trim(),
      empresa: document.getElementById("empresa").value.trim(),
      produto_servico: document.getElementById("produto_servico").value.trim(),
      // Instagram da empresa é opcional: vazio vai como null.
      instagram: document.getElementById("instagram").value.trim() || null,
      // Pergunta do TikTok removida em 20/11 (Igor). Colunas ficam no banco, opcionais.
      tiktok: null,
      nao_tem_tiktok: null,
      reconhecido: document.getElementById("reconhecido").value.trim(),
      // Pergunta nova em 21/11 (Igor), opcional: vazio vai como null.
      inspiracoes: document.getElementById("inspiracoes").value.trim().slice(0, 1000) || null,
      // Perguntas retiradas em 20/11 (decisão do Igor). As colunas ficam no banco,
      // opcionais depois da migration; enviamos null de forma explícita.
      primeira_impressao: null,
      deseja_que_pensem: null,
      publico_desejado: document.getElementById("publico_desejado").value.trim(),
      consent: true,
      user_agent: (navigator.userAgent || "").slice(0, 500),
      utm: readUtm(),
    };
  }

  function describeSubmitError(res, bodyText) {
    const status = res ? res.status : 0;
    const raw = String(bodyText || "");
    let parsed = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch (err) { parsed = null; }
    const code = parsed && (parsed.code || parsed.error);
    const message = parsed && (parsed.message || parsed.hint || parsed.details);
    const blob = (code + " " + message + " " + raw).toLowerCase();
    const missingTable =
      status === 404 ||
      status === 406 ||
      /pgrst205|pgrst106|could not find the table|does not exist|schema cache|relation .* does not exist/i.test(blob);

    if (missingTable) {
      return "Não foi possível enviar: a tabela public." + TABLE + " ainda não existe no Viral Data. A migration em docs/master-plan-supabase.sql precisa ser aplicada antes do envio funcionar.";
    }
    if (message) {
      return "Não foi possível enviar (" + status + "): " + String(message).slice(0, 280);
    }
    if (status) {
      return "Não foi possível enviar agora (HTTP " + status + "). Tente de novo em instantes.";
    }
    return "Não foi possível enviar agora. Verifique a conexão e tente de novo.";
  }

  async function submitApp() {
    if (state.sending || stepName() !== "consent") return;
    if (!validate("consent", true)) {
      shake();
      return;
    }
    const hp = document.getElementById("hp_check").value;
    if (hp) {
      go(STEPS.indexOf("success"), 1);
      return;
    }
    if (!configReady()) {
      showErr("consent", "Envio indisponível: falta aplicar/config.js com a URL e a anon key do projeto Viral Data (o Supabase que o time já usa).");
      shake();
      return;
    }
    state.sending = true;
    sendBtn.disabled = true;
    sendBtn.textContent = "Enviando…";
    clearErr("consent");
    try {
      const cfg = window.VML_SUPABASE;
      const url = String(cfg.url).replace(/\/$/, "") + "/rest/v1/" + TABLE;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          apikey: cfg.anonKey,
          Authorization: "Bearer " + cfg.anonKey,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(payload()),
      });
      if (!res.ok) {
        const bodyText = await res.text().catch(() => "");
        showErr("consent", describeSubmitError(res, bodyText));
        shake();
        return;
      }
      go(STEPS.indexOf("success"), 1);
    } catch (err) {
      showErr("consent", "Não foi possível enviar agora. Verifique a conexão e tente de novo.");
      shake();
    } finally {
      state.sending = false;
      sendBtn.disabled = false;
      sendBtn.textContent = "Enviar";
      syncChrome();
    }
  }

  function setFat(value, label, advanceAfter) {
    state.fat = value;
    fatValue.value = value;
    fatLabel.textContent = label;
    fatPicker.classList.toggle("has-value", !!value);
    fatPanel.querySelectorAll(".picker-opt").forEach((btn) => {
      btn.classList.toggle("is-selected", btn.dataset.value === value);
    });
    clearErr("faturamento");
    closeFat(false);
    if (advanceAfter && stepName() === "faturamento") {
      window.setTimeout(() => advance(), motionOk ? 180 : 0);
    }
  }

  function openFat() {
    fatPanel.hidden = false;
    fatPicker.classList.add("is-open");
    fatTrigger.setAttribute("aria-expanded", "true");
  }

  function closeFat() {
    fatPanel.hidden = true;
    fatPicker.classList.remove("is-open");
    fatTrigger.setAttribute("aria-expanded", "false");
  }

  applySuccessCopy();
  fillCountries();
  syncChrome();

  document.getElementById("start").addEventListener("click", () => go(1, 1));
  form.querySelectorAll("[data-go]").forEach((btn) => btn.addEventListener("click", advance));
  prevBtn.addEventListener("click", back);
  nextBtn.addEventListener("click", advance);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (stepName() === "consent") submitApp();
    else advance();
  });

  TEXT_FIELDS.forEach((name) => {
    document.getElementById(name).addEventListener("input", () => {
      if (document.getElementById(name).classList.contains("invalid")) validate(name, "quiet");
    });
  });

  TEXTAREAS.concat(OPTIONAL_TEXTAREAS).forEach((name) => {
    const el = document.getElementById(name);
    el.addEventListener("input", () => {
      if (el.classList.contains("invalid")) validate(name, "quiet");
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        advance();
      }
    });
  });

  telInput.addEventListener("input", () => {
    if (ehBrasil()) telInput.value = mascaraBR(soDigitos(telInput.value).slice(0, 11));
    if (telInput.classList.contains("invalid")) validate("whatsapp", "quiet");
  });
  ddiSelect.addEventListener("change", () => {
    telInput.value = ehBrasil() ? mascaraBR(soDigitos(telInput.value).slice(0, 11)) : soDigitos(telInput.value);
    telInput.placeholder = ehBrasil() ? "(11) 99999-9999" : "Número com DDD";
    clearErr("whatsapp");
  });

  document.getElementById("ciente").addEventListener("change", () => clearErr("consent"));

  fatTrigger.addEventListener("click", () => {
    if (fatPanel.hidden) openFat();
    else closeFat();
  });
  fatPanel.querySelectorAll(".picker-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      const text = btn.textContent.replace(/^[A-D]\s*/, "").trim();
      setFat(btn.dataset.value, text, true);
    });
  });
  document.addEventListener("keydown", (e) => {
    if (stepName() !== "faturamento") return;
    if (e.key === "Enter" && state.fat && fatPanel.hidden) {
      e.preventDefault();
      advance();
      return;
    }
    const key = e.key.toUpperCase();
    if (key === "ESCAPE") {
      closeFat();
      return;
    }
    const opt = fatPanel.querySelector('[data-key="' + key + '"]');
    if (opt && document.activeElement !== telInput) {
      e.preventDefault();
      const text = opt.textContent.replace(/^[A-D]\s*/, "").trim();
      setFat(opt.dataset.value, text, true);
    }
  });
  document.addEventListener("click", (e) => {
    if (!fatPicker.contains(e.target)) closeFat();
  });
})();
