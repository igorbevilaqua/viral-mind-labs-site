// Atualiza os números do index.html a partir dos bancos (Supabase).
// Rodado semanalmente pelo GitHub Actions (.github/workflows/update-stats.yml)
// e também à mão: `node scripts/update-stats.mjs`
//
// Atualiza:
//   - seção "Números" (views totais, clientes ativos, maior vídeo)
//   - cases de sucesso (antes -> hoje), via data-ig-from / data-ig-to
//   - constelação, grid mobile e chips de clientes, via data-ig / data-ig-chip
//
// As chaves abaixo são publishable keys — públicas por design (as mesmas que
// iriam no JS do navegador). As funções vm_site_stats/vm_site_clients só
// devolvem agregados que já ficam visíveis no site, e a lista de clientes
// dentro de vm_site_clients é fixa, então a chave não permite enumerar a
// carteira de clientes.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DATA = {
  url: "https://qclvrddrqulgfzccndnl.supabase.co",
  key: "sb_publishable_gtBx11GmHh3H1WbrKUMjxg_kfJVpiEZ",
};
const CRM = {
  url: "https://adtnxhxjgpdqehuxrvzl.supabase.co",
  key: "sb_publishable_q7Gz4dA6gTqvLykFMv7Low_rq2d-4kW",
};

const htmlPath = join(dirname(fileURLToPath(import.meta.url)), "..", "index.html");

async function rpc({ url, key }, fn) {
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw new Error(`${fn} respondeu ${res.status}: ${await res.text()}`);
  return res.json();
}

// Formatos do site. Abaixo de 10 mil mostra o número cheio de propósito:
// num "antes" de case, "5.875" é mais concreto e credível que "5,9 mil".
function fmt(v) {
  if (v >= 1e6) {
    const m = v / 1e6;
    return (m >= 10 ? Math.round(m).toString() : m.toFixed(1).replace(".", ",")) + "M";
  }
  if (v >= 1e5) return Math.round(v / 1000).toLocaleString("pt-BR") + " mil";
  if (v >= 1e4) return (v / 1000).toFixed(1).replace(".", ",") + " mil";
  return Math.round(v).toLocaleString("pt-BR");
}

const [stats, crm] = await Promise.all([rpc(DATA, "vm_site_stats"), rpc(CRM, "vm_site_clients")]);
const clientes = crm.clientes;
const agregado = crm.agregado;

// ---- trava de sanidade: dado ruim não vira número errado no ar ----
const views = Math.floor(stats.views_totais / 1e6);
const maior = Math.floor(stats.maior_video / 1e6);
const ativos = stats.clientes_ativos;
for (const [nome, v, max] of [["views", views, 100000], ["maior vídeo", maior, 1000], ["clientes ativos", ativos, 500]]) {
  if (!Number.isFinite(v) || v <= 0 || v > max) throw new Error(`valor suspeito para ${nome}: ${v} — abortando`);
}
if (!Array.isArray(clientes) || clientes.length < 10) {
  throw new Error(`vm_site_clients devolveu ${clientes?.length} clientes (esperado 13+) — abortando`);
}
const porHandle = new Map();
const desatualizados = [];
for (const c of clientes) {
  if (typeof c.atual !== "number" || c.atual <= 0) continue;
  porHandle.set(c.handle, c);
  // medição velha no CRM = site publica número defasado; avisa pra corrigir a coleta
  const dias = (Date.now() - Date.parse(c.medido_em)) / 86400000;
  if (dias > 30) desatualizados.push(`${c.handle} (${Math.round(dias)}d)`);
}
if (desatualizados.length) {
  console.warn(`ATENÇÃO — sem medição recente no CRM, número pode estar defasado: ${desatualizados.join(", ")}`);
}

let html = readFileSync(htmlPath, "utf8");
const original = html;
const trocas = [];

function troca(re, valor, rotulo) {
  if (!re.test(html)) {
    console.warn(`aviso: markup não encontrado (${rotulo}) — pulando`);
    return;
  }
  const antes = html;
  html = html.replace(re, (...g) => `${g[1]}${valor}${g[2]}`);
  if (antes !== html) trocas.push(rotulo);
}

// ---- seção "Números" (ancorada no rótulo pra não trocar o número errado) ----
troca(/(<span data-count-to=")\d+(">0<\/span>M\+<\/div>\s*<div class="stat-label">Visualizações geradas)/, views, "views totais");
troca(/(<span data-count-to=")\d+(">0<\/span><\/div>\s*<div class="stat-label">Autoridades atendidas)/, ativos, "clientes ativos");
troca(/(<span data-count-to=")\d+(">0<\/span>M<\/div>\s*<div class="stat-label">Pessoas alcançadas)/, maior, "maior vídeo");

// ---- clientes: constelação, grid mobile, chips e cases ----
for (const [handle, c] of porHandle) {
  const h = handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  troca(new RegExp(`(<span class="num" data-ig="${h}"[^>]*>)[^<]*(</span>)`), fmt(c.atual), `constelação ${handle}`);
  troca(new RegExp(`(<span class="ca-num" data-ig="${h}">)[^<]*(</span>)`), fmt(c.atual), `grid mobile ${handle}`);
  troca(new RegExp(`(<a class="tag rest" data-ig-chip="${h}"[^>]*>@${h} · )[^<]*(</a>)`), fmt(c.atual), `chip ${handle}`);
  troca(new RegExp(`(<span class="to" data-ig-to="${h}">)[^<]*(</span>)`), `${fmt(c.atual)} seguidores`, `case hoje ${handle}`);
  if (typeof c.inicial === "number" && c.inicial > 0) {
    troca(new RegExp(`(<span class="from" data-ig-from="${h}">)[^<]*(</span>)`), fmt(c.inicial), `case antes ${handle}`);
  }
}

// ---- selo agregado: carteira ATIVA inteira, não só os rostos exibidos ----
// (o design original já dizia "22 autoridades" mostrando 10 balões — o selo
// fala da carteira, a constelação é uma amostra dela)
const totalAtivos = agregado?.total_ativos;
const somaAtivos = agregado?.soma_seguidores;
if (Number.isFinite(totalAtivos) && totalAtivos > 0 && Number.isFinite(somaAtivos) && somaAtivos > 1e6) {
  const somaFmt = (somaAtivos / 1e6).toFixed(1).replace(".", ",") + "M";
  troca(new RegExp(`(<b>)[^<]*(</b>\\s*<span class="lbl">seguidores somados)`), somaFmt, "selo constelação");
  troca(new RegExp(`(<div class="clientes-mobile-stat"><b>)[^<]*(</b>)`), somaFmt, "selo mobile");
  troca(new RegExp(`(<span class="sub">)\\d+( autoridades</span>)`), totalAtivos, "contagem constelação");
  troca(new RegExp(`(seguidores somados · )\\d+( autoridades)`), totalAtivos, "contagem mobile");
} else {
  console.warn("agregado ausente ou suspeito — selo da constelação mantido como está");
}

if (html === original) {
  console.log(`Nada mudou (${views}M+ views · ${ativos} clientes · maior vídeo ${maior}M).`);
} else {
  writeFileSync(htmlPath, html);
  console.log(`Atualizado: ${views}M+ views · ${ativos} clientes ativos · maior vídeo ${maior}M`);
  console.log(`${trocas.length} valores trocados: ${trocas.join(", ")}`);
}
