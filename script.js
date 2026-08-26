(() => {
  "use strict";

  const hero = document.getElementById("hero");
  const phone = document.getElementById("phone");
  const phoneBox = document.getElementById("phoneBox");
  const hint = document.getElementById("hint");
  const before = document.getElementById("ig-before");
  const after = document.getElementById("ig-after");
  const lblB = document.getElementById("lblB");
  const lblA = document.getElementById("lblA");
  const constWrap = document.getElementById("const-wrap");
  const constEl = document.getElementById("const");

  function applyHero() {
    if (!hero || !phone) return;
    const total = Math.max(hero.offsetHeight - window.innerHeight, 1);
    const p = Math.max(0, Math.min(1, -hero.getBoundingClientRect().top / total));
    const e = p * p * (3 - 2 * p);

    if (before) before.style.opacity = String(1 - e);
    if (after) after.style.opacity = String(e);
    if (hint) hint.style.display = window.innerHeight < 720 ? "none" : "flex";

    const s = Math.max(0.24, Math.min(0.62, (window.innerHeight - 384) / 874));
    if (phoneBox) {
      phoneBox.style.width = Math.round(402 * s) + "px";
      phoneBox.style.height = Math.round(874 * s) + "px";
      phone.style.marginLeft = "-" + Math.round((402 - 402 * s) / 2) + "px";
    }
    phone.style.transform = "scale(" + s.toFixed(3) + ") rotate(" + ((1 - e) * 5).toFixed(2) + "deg) translateY(" + ((1 - e) * 30).toFixed(1) + "px)";
    if (lblB) lblB.style.opacity = String(Math.max(0.25, 1 - e));
    if (lblA) lblA.style.opacity = String(Math.max(0.25, e));
  }

  function fitConst() {
    if (!constWrap || !constEl) return;
    const s = Math.min(1, constWrap.clientWidth / 1100);
    constEl.style.transform = "translateX(-50%) scale(" + s.toFixed(3) + ")";
    constWrap.style.height = Math.round(620 * s) + "px";
  }

  const caseMockups = Array.from(document.querySelectorAll(".case-mockup img"));
  function applyCaseTilt() {
    const vh = window.innerHeight;
    const start = vh * 0.92;
    const end = vh * 0.4;
    caseMockups.forEach((img) => {
      const r = img.getBoundingClientRect();
      const raw = (start - r.top) / (start - end);
      const p = Math.max(0, Math.min(1, raw));
      const e = p * p * (3 - 2 * p);
      img.style.setProperty("--tilt", (-9 + e * 6.5).toFixed(2) + "deg");
    });
  }

  // reveal-on-scroll
  const revealEls = Array.from(document.querySelectorAll("[data-reveal]"));
  revealEls.forEach((el) => {
    el.style.transitionDelay = (parseInt(el.dataset.reveal, 10) || 0) * 90 + "ms";
  });
  const revealIo = new IntersectionObserver(
    (entries) => entries.forEach((x) => {
      if (x.isIntersecting) {
        x.target.classList.add("is-visible");
        revealIo.unobserve(x.target);
      }
    }),
    { threshold: 0.12 }
  );
  revealEls.forEach((el) => revealIo.observe(el));
  // safety net in case an element never crosses the threshold (e.g. taller than viewport)
  setTimeout(() => revealEls.forEach((el) => el.classList.add("is-visible")), 6000);

  // counters
  function startCount(el) {
    if (el._counting) return;
    el._counting = true;
    const to = parseFloat(el.dataset.countTo);
    const dur = 2600;
    const t0 = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const ease = 1 - Math.pow(1 - k, 4);
      const v = Math.round(to * ease);
      el.textContent = v.toLocaleString("pt-BR");
      const pop = k > 0.85 ? 1 + Math.sin(((k - 0.85) / 0.15) * Math.PI) * 0.06 : 1;
      el.style.transform = "scale(" + pop.toFixed(3) + ")";
      if (k < 1) requestAnimationFrame(tick);
      else {
        el.textContent = to.toLocaleString("pt-BR");
        el.style.transform = "scale(1)";
        el._counting = false;
      }
    };
    requestAnimationFrame(tick);
  }
  const countEls = Array.from(document.querySelectorAll("[data-count-to]"));
  const countIo = new IntersectionObserver(
    (entries) => entries.forEach((x) => {
      if (x.isIntersecting) startCount(x.target);
    }),
    { threshold: 0.5 }
  );
  countEls.forEach((el) => countIo.observe(el));

  // scroll/resize loop
  let ticking = false;
  function onFrame() {
    ticking = false;
    applyHero();
    fitConst();
    applyCaseTilt();
  }
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(onFrame);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  applyHero();
  fitConst();
  applyCaseTilt();

  // FAQ accordion (one open at a time)
  document.querySelectorAll(".faq-item").forEach((item) => {
    item.querySelector(".faq-q").addEventListener("click", () => {
      const opening = !item.classList.contains("open");
      document.querySelectorAll(".faq-item.open").forEach((o) => {
        o.classList.remove("open");
        o.querySelector(".faq-icon").textContent = "+";
      });
      if (opening) {
        item.classList.add("open");
        item.querySelector(".faq-icon").textContent = "−";
      }
    });
  });

  // application form
  const form = document.getElementById("apply-form");
  const cienteInput = document.getElementById("f-ciente");
  const consentErr = document.getElementById("consent-err");
  const formView = document.getElementById("form-view");
  const formSent = document.getElementById("form-sent");
  // Google Apps Script Web App URL — cole aqui depois de implantar
  // (ver docs/superpowers/specs/2026-08-26-form-google-sheets-design.md)
  const SHEETS_WEBHOOK_URL = "COLE_AQUI_A_URL_DO_APPS_SCRIPT";

  if (form) {
    cienteInput.addEventListener("change", () => consentErr.classList.remove("is-visible"));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!cienteInput.checked) {
        consentErr.classList.add("is-visible");
        return;
      }
      const faturamentoSelect = document.getElementById("f-faturamento");
      const payload = {
        website: form.website.value, // honeypot — bot preenche, humano não vê
        nome: form.nome.value,
        empresa: form.empresa.value,
        whatsapp: form.whatsapp.value,
        email: form.email.value,
        ramo: form.ramo.value,
        instagram: form.instagram.value,
        faturamento: faturamentoSelect.selectedOptions[0] ? faturamentoSelect.selectedOptions[0].text : "",
        obs: form.obs.value,
      };
      if (SHEETS_WEBHOOK_URL.indexOf("http") === 0) {
        // no-cors: o Apps Script não devolve header de CORS, então a
        // resposta não pode ser lida — dispara e assume sucesso (ver spec).
        fetch(SHEETS_WEBHOOK_URL, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(payload),
        }).catch(() => {});
      }
      formView.style.display = "none";
      formSent.style.display = "block";
    });
  }
})();
