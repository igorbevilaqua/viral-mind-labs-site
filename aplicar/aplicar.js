(() => {
  "use strict";

  const STEPS = ["welcome", "nome", "email", "whatsapp", "empresa", "ramo", "instagram", "faturamento", "obs", "consent", "success"];
  const form = document.getElementById("apply-form");
  const viewport = form;
  const progress = document.getElementById("progress");
  const pager = document.getElementById("pager");
  const prevBtn = document.getElementById("prev");
  const nextBtn = document.getElementById("next");
  const live = document.getElementById("live");
  const ddiSelect = document.getElementById("ddi");
  const telInput = document.getElementById("whatsapp");
  const obsInput = document.getElementById("obs");
  const obsOk = document.getElementById("obs-ok");
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

  function showErr(name, msg) {
    const el = form.querySelector('[data-err="' + name + '"]');
    const field = document.getElementById(name);
    if (field) field.classList.toggle("invalid", !!msg);
    if (name === "faturamento") fatPicker.classList.toggle("is-invalid", !!msg);
    if (!el) return;
    if (msg) {
      el.hidden = false;
      el.textContent = msg;
      live.textContent = msg;
    } else {
      el.hidden = true;
      el.textContent = "";
    }
  }

  function clearErr(name) {
    showErr(name, "");
  }

  function validate(name, report) {
    let msg = "";
    if (name === "nome" && document.getElementById("nome").value.trim().length < 2) {
      msg = "Informe seu nome completo.";
    } else if (name === "email" && !emailValido()) {
      msg = "Informe um e-mail válido, com domínio completo (ex.: nome@empresa.com.br).";
    } else if (name === "whatsapp" && !telValido()) {
      msg = ehBrasil()
        ? "Informe DDD + número (10 ou 11 dígitos)."
        : "Informe o número completo do país selecionado.";
    } else if (name === "empresa" && !document.getElementById("empresa").value.trim()) {
      msg = "Informe o nome da empresa.";
    } else if (name === "ramo" && !document.getElementById("ramo").value.trim()) {
      msg = "Informe o ramo de atuação.";
    } else if (name === "instagram" && !document.getElementById("instagram").value.trim()) {
      msg = "Informe o link ou @ do Instagram.";
    } else if (name === "faturamento" && !state.fat) {
      msg = "Selecione uma faixa de faturamento.";
    } else if (name === "consent" && !document.getElementById("ciente").checked) {
      msg = "Para enviar a aplicação, é necessário confirmar que está ciente das condições acima.";
    }
    if (report) showErr(name, msg);
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
    if (target) target.focus({ preventScroll: true });
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
    if (name !== "obs" && !validate(name, true)) {
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
    const params = new URLSearchParams(window.location.search);
    const found = {};
    params.forEach((value, rawKey) => {
      const key = String(rawKey || "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 40);
      const ok = key === "gclid" || key === "fbclid" || /^utm_[a-z0-9_]+$/.test(key);
      if (!ok || found[key]) return;
      const clean = String(value || "").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 200);
      if (clean) found[key] = clean;
    });
    const canonical = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id"];
    const clicks = ["gclid", "fbclid"];
    const extras = Object.keys(found).filter((key) => /^utm_[a-z0-9_]+$/.test(key) && canonical.indexOf(key) === -1).sort();
    const priority = canonical.concat(clicks, extras).filter((key) => found[key]);
    const kept = {};
    priority.slice(0, 20).forEach((key) => {
      kept[key] = found[key];
    });
    const utm = {};
    canonical.concat(extras, clicks).forEach((key) => {
      if (kept[key]) utm[key] = kept[key];
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
      empresa: document.getElementById("empresa").value.trim(),
      ramo: document.getElementById("ramo").value.trim(),
      instagram: document.getElementById("instagram").value.trim(),
      faturamento: state.fat,
      obs: obsInput.value.trim() || null,
      consent: true,
      user_agent: (navigator.userAgent || "").slice(0, 500),
      utm: readUtm(),
    };
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
      const url = String(cfg.url).replace(/\/$/, "") + "/rest/v1/site_applications";
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
        showErr("consent", "Não foi possível enviar agora. Tente de novo em instantes.");
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

  function syncObsButton() {
    obsOk.textContent = obsInput.value.trim() ? "OK" : "Pular";
  }

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

  ["nome", "email", "empresa", "ramo", "instagram"].forEach((name) => {
    document.getElementById(name).addEventListener("input", () => {
      if (document.getElementById(name).classList.contains("invalid")) validate(name, true);
    });
  });

  telInput.addEventListener("input", () => {
    if (ehBrasil()) telInput.value = mascaraBR(soDigitos(telInput.value).slice(0, 11));
    if (telInput.classList.contains("invalid")) validate("whatsapp", true);
  });
  ddiSelect.addEventListener("change", () => {
    telInput.value = ehBrasil() ? mascaraBR(soDigitos(telInput.value).slice(0, 11)) : soDigitos(telInput.value);
    telInput.placeholder = ehBrasil() ? "(11) 99999-9999" : "Número com DDD";
    clearErr("whatsapp");
  });

  obsInput.addEventListener("input", syncObsButton);
  obsInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      advance();
    }
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
    if (opt && document.activeElement !== obsInput) {
      e.preventDefault();
      const text = opt.textContent.replace(/^[A-D]\s*/, "").trim();
      setFat(opt.dataset.value, text, true);
    }
  });
  document.addEventListener("click", (e) => {
    if (!fatPicker.contains(e.target)) closeFat();
  });
})();
