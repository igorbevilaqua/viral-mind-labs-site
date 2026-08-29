// Atualiza os números da seção "Números" do index.html a partir do banco.
// Rodado semanalmente pelo GitHub Actions (.github/workflows/update-stats.yml)
// e também à mão: `node scripts/update-stats.mjs`
//
// A chave abaixo é a publishable key do Supabase — pública por design (é a
// mesma que iria no JS do navegador). A função vm_site_stats() só devolve
// agregados que já ficam visíveis no site, nada individual.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SUPABASE_URL = "https://qclvrddrqulgfzccndnl.supabase.co";
const SUPABASE_KEY = "sb_publishable_gtBx11GmHh3H1WbrKUMjxg_kfJVpiEZ";

const htmlPath = join(dirname(fileURLToPath(import.meta.url)), "..", "index.html");

const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/vm_site_stats`, {
  method: "POST",
  headers: {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
  },
  body: "{}",
});
if (!res.ok) throw new Error(`Supabase respondeu ${res.status}: ${await res.text()}`);
const stats = await res.json();

// floor, não round: melhor afirmar de menos que de mais
const views = Math.floor(stats.views_totais / 1e6);
const maior = Math.floor(stats.maior_video / 1e6);
const clientes = stats.clientes_ativos;

// trava de sanidade: número zerado ou absurdo = dado ruim, aborta sem tocar no site
for (const [nome, v, max] of [["views", views, 100000], ["maior vídeo", maior, 1000], ["clientes", clientes, 500]]) {
  if (!Number.isFinite(v) || v <= 0 || v > max) {
    throw new Error(`valor suspeito para ${nome}: ${v} — abortando sem alterar o site`);
  }
}

let html = readFileSync(htmlPath, "utf8");
const before = html;

// cada troca é ancorada no rótulo da métrica, pra não trocar o número errado
const swaps = [
  [/(<span data-count-to=")\d+(">0<\/span>M\+<\/div>\s*<div class="stat-label">Visualizações geradas)/, views],
  [/(<span data-count-to=")\d+(">0<\/span><\/div>\s*<div class="stat-label">Autoridades atendidas)/, clientes],
  [/(<span data-count-to=")\d+(">0<\/span>M<\/div>\s*<div class="stat-label">Pessoas alcançadas)/, maior],
];
for (const [re, valor] of swaps) {
  if (!re.test(html)) throw new Error(`markup não encontrado para o padrão ${re}`);
  html = html.replace(re, `$1${valor}$2`);
}

if (html === before) {
  console.log(`Nada mudou (views ${views}M+, ${clientes} clientes, maior vídeo ${maior}M).`);
} else {
  writeFileSync(htmlPath, html);
  console.log(`Atualizado: ${views}M+ views · ${clientes} clientes ativos · maior vídeo ${maior}M`);
}
