# Formulário de aplicação → Google Sheets

## Contexto
`#apply-form` (seção `#aplicar`) hoje só valida no client e mostra a tela de
"enviado" — não persiste os dados em lugar nenhum (marcado com um comentário
`ponytail:` em `script.js`). O usuário quer que cada envio vire uma linha
numa planilha Google Sheets.

## Restrição de arquitetura
Site 100% estático, sem servidor/serverless próprio. Não dá pra colocar
credencial do Google no JS do cliente (ficaria pública no repo).

## Abordagem tentada e abandonada: Google Apps Script Web App
Primeira escolha: script Apps Script implantado como Web App, ligado à
conta Google do usuário — grátis, sem infraestrutura nova. **Abandonada**:
o Google bloqueou a autorização com "This app is blocked" (tela de bloqueio
forte, sem opção "Avançado" pra prosseguir mesmo assim) em duas contas
Google diferentes, mesmo depois de configurar a tela de consentimento OAuth
e adicionar usuário de teste. Não foi possível contornar sem acesso mais
profundo ao Google Cloud Console (criar projeto próprio, publicar app) —
desproporcional pro problema.

## Abordagem implementada: Google Form escondido
O Google Forms aceita envios `POST` públicos sem autenticação nenhuma (é
feito pra isso) — sidesteps o bloqueio de OAuth inteiramente. O Form em si
**nunca é visto pelo visitante**: existe só como "recebedor" de dados nos
bastidores, já linkado a uma planilha (Respostas → ícone do Sheets, um
clique, cria as colunas sozinho). O formulário visível no site continua
sendo o `#apply-form` de sempre, com o mesmo visual e campos.

Descartadas: serviço terceiro tipo SheetDB/Sheet.best (dados de lead
passando por fora, dependência de terceiro, limite grátis baixo) e função
serverless própria (Vercel/Cloudflare — infraestrutura nova desproporcional
pro problema, mesmo motivo do Apps Script).

## Limitações conhecidas da abordagem (aceitas conscientemente)
- **Sem confirmação de sucesso**: Google Forms não devolve resposta legível
  via CORS. O fetch é feito com `mode: "no-cors"` — a requisição é enviada,
  mas o JS do cliente nunca sabe se deu certo. O formulário mostra
  "aplicação enviada" assumindo sucesso, no mesmo instante em que dispara o
  envio. Aceitável para um formulário de captação de lead.
- **Honeypot antispam no client**: como não há mais um handler de servidor
  pra filtrar bots (Forms não roda lógica custom), o campo invisível
  `website` é checado ANTES de disparar o fetch — se vier preenchido
  (indício de bot), o envio pro Form é simplesmente pulado.
- **IDs de campo (`entry.NNNNNN`) são amarrados ao Form específico**: se o
  Form for recriado do zero (não apenas editado), os IDs mudam e a
  integração quebra silenciosamente (o `no-cors` esconde o erro). Editar
  perguntas existentes do Form já criado é seguro; recriar do zero exige
  atualizar `GOOGLE_FORM_FIELDS` em `script.js` de novo.

## Mapeamento de campos (Form ID `1FAIpQLSetH1auyxxWYH-HGRI9sl1i5cI55E6BNJ7fO3WJqtkKsPSkuA`)
| Campo do site | Pergunta no Form | entry ID |
|---|---|---|
| nome | Nome | entry.1511593986 |
| empresa | Empresa | entry.92333426 |
| whatsapp | Whatsapp | entry.223572430 |
| email | Email | entry.1316463294 |
| ramo | Ramo | entry.2079113110 |
| instagram | Perfil no Instagram (@ ou URL) | entry.611997242 |
| faturamento | Faturamento | entry.1547981891 |
| obs | Observações | entry.668118878 |

Ação de envio: `https://docs.google.com/forms/d/e/1FAIpQLSetH1auyxxWYH-HGRI9sl1i5cI55E6BNJ7fO3WJqtkKsPSkuA/formResponse`
(POST `application/x-www-form-urlencoded`, chaves = entry IDs acima).

## Onde está implementado
`script.js` — `GOOGLE_FORM_ACTION`, `GOOGLE_FORM_FIELDS`, e o listener de
`submit` do `#apply-form` (monta o body, checa honeypot, dispara fetch).

## Fora de escopo
Notificação por e-mail/WhatsApp a cada novo lead, dashboard, deduplicação
de envios repetidos, validação server-side dos campos (o form já valida no
client via `required`) — nada disso foi pedido, fica pra depois se
precisar.
