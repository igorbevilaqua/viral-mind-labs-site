# Formulário de aplicação → Google Sheets

## Contexto
`#apply-form` (seção `#aplicar`) hoje só valida no client e mostra a tela de
"enviado" — não persiste os dados em lugar nenhum (marcado com um comentário
`ponytail:` em `script.js`). O usuário quer que cada envio vire uma linha
numa planilha Google Sheets.

## Restrição de arquitetura
Site 100% estático, sem servidor/serverless próprio. Não dá pra colocar
credencial do Google no JS do cliente (ficaria pública no repo). Abordagem
escolhida: **Google Apps Script implantado como Web App**, ligado à conta
Google do usuário — grátis, sem infraestrutura nova, mesma filosofia
"zero dependência" do resto do projeto.

Descartadas: serviço terceiro tipo SheetDB/Sheet.best (dados de lead
passando por fora, dependência de terceiro, limite grátis baixo) e função
serverless própria (Vercel/Cloudflare — exige infraestrutura nova que o
projeto não tem hoje, desproporcional pro problema).

## Limitações conhecidas da abordagem (aceitas conscientemente)
- **CORS**: Apps Script Web App não deixa o navegador ler a resposta HTTP
  (limitação do Google, sem contorno sem infra extra). O fetch é feito com
  `mode: "no-cors"` — a requisição é enviada e o Apps Script processa
  normalmente, mas o JS do cliente nunca sabe se deu certo ou errado. O
  formulário mostra "aplicação enviada" assumindo sucesso, no mesmo
  instante em que dispara o envio — não espera confirmação. Risco: numa
  falha rara do Apps Script, o usuário veria sucesso mesmo se a linha não
  foi gravada. Aceitável para um formulário de captação de lead.
- **Preflight**: `Content-Type: text/plain;charset=utf-8` no fetch (em vez
  de `application/json`) evita que o navegador dispare uma requisição
  `OPTIONS` de preflight antes do POST — Apps Script não trata `OPTIONS`
  bem. O corpo continua sendo uma string JSON; o Apps Script faz o parse.
- **Honeypot antispam**: como o endpoint fica público, um campo invisível
  (`website` ou similar, fora da visão/tab-order humana) é adicionado ao
  form. Se vier preenchido, é bot — o Apps Script descarta o envio
  silenciosamente (não grava linha, não retorna erro visível a ninguém,
  já que o cliente não lê a resposta mesmo).

## Colunas da planilha
Criadas automaticamente pelo Apps Script na primeira execução (cabeçalho),
na ordem: `Timestamp`, `Nome`, `Empresa`, `WhatsApp`, `Email`, `Ramo`,
`Instagram`, `Faturamento`, `Observações`.

## Divisão de responsabilidade (o que cada lado faz)
- **Eu escrevo agora**: o código do Apps Script (`scripts/apps-script-form-handler.gs`,
  mantido no repo só como referência/histórico — não é deployado por git,
  é colado manualmente no editor do Apps Script), o campo honeypot no HTML,
  e a integração no `script.js` (fetch no submit do form), com a URL do Web
  App como uma constante clara `SHEETS_WEBHOOK_URL = "COLE_AQUI"` fácil de
  substituir depois.
- **Usuário faz depois** (só ele tem acesso à própria conta Google):
  1. Abrir a planilha em branco já criada.
  2. Extensões → Apps Script.
  3. Colar o conteúdo de `scripts/apps-script-form-handler.gs`.
  4. Implantar → Nova implantação → tipo "Web App" → Executar como "Eu" →
     Quem tem acesso "Qualquer pessoa".
  5. Copiar a URL gerada e me passar de volta.
  6. Eu troco o placeholder `SHEETS_WEBHOOK_URL` pela URL real e dou o
     release.

## Fora de escopo
Notificação por e-mail/WhatsApp a cada novo lead, dashboard, deduplicação
de envios repetidos, validação server-side dos campos (o form já valida no
client via `required`) — nada disso foi pedido, fica pra depois se
precisar.
