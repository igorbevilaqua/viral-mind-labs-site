# Aviso por e-mail a cada aplicação

O destino é o projeto Supabase **Viral Data**, o mesmo que o time já usa para os dados da Viral Mind Labs. Não abrir projeto novo. A tabela `public.site_applications` é criada nesse projeto (ver [`aplicar-supabase.sql`](aplicar-supabase.sql)). O site só grava a linha; o e-mail sai de um gancho no Viral Data, nunca do JavaScript público. URL e anon key ficam como placeholder em `aplicar/config.example.js` até alguém copiar os valores de Settings → API desse projeto.

Não crie conta paga para isso. Use uma caixa que já exista e, se for chamar uma API de e-mail, um provedor que você já tenha. `NOTIFY_EMAIL` abaixo é só um placeholder.

## 1. Banco

No SQL Editor do **Viral Data** (projeto existente), rode [`aplicar-supabase.sql`](aplicar-supabase.sql). Isso cria `public.site_applications` lá. Não rode este SQL a partir do repositório.

## 2. Segredos

No projeto Viral Data, em Edge Functions → Secrets (ou `supabase secrets set` na sua máquina, sem commitar):

| Segredo | Exemplo | Uso |
|---|---|---|
| `NOTIFY_EMAIL` | `igor@viralmindlabs.com` | Quem recebe o aviso |
| `EMAIL_WEBHOOK_URL` | URL que você já usa para enviar e-mail | POST com o texto pronto |
| `EMAIL_WEBHOOK_TOKEN` | token desse webhook, se houver | Header `Authorization` |

`EMAIL_WEBHOOK_URL` pode ser um webhook de e-mail que a operação já tenha (Apps Script, provedor SMTP via HTTP, automação interna). Se ainda não houver URL, pule o deploy da função e leia as linhas direto na tabela `site_applications` no painel. O formulário não depende do e-mail para gravar.

## 3. Edge Function `notify-application`

Crie a função no projeto Viral Data (não está neste repositório de propósito, para ninguém fazer deploy sem querer). Esboço:

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (req) => {
  const notifyEmail = Deno.env.get("NOTIFY_EMAIL");
  const webhookUrl = Deno.env.get("EMAIL_WEBHOOK_URL");
  const webhookToken = Deno.env.get("EMAIL_WEBHOOK_TOKEN");
  if (!notifyEmail || !webhookUrl) {
    return new Response("NOTIFY_EMAIL or EMAIL_WEBHOOK_URL missing", { status: 500 });
  }

  const payload = await req.json();
  const row = payload.record ?? {};
  const subject = `Nova aplicação — ${row.nome || "sem nome"}`;
  const text = [
    `Nome: ${row.nome}`,
    `E-mail: ${row.email}`,
    `WhatsApp: ${row.whatsapp}`,
    `Empresa: ${row.empresa}`,
    `Ramo: ${row.ramo}`,
    `Instagram: ${row.instagram}`,
    `Faturamento: ${row.faturamento}`,
    `Obs: ${row.obs || "—"}`,
    `Quando: ${row.created_at}`,
  ].join("\n");

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(webhookToken ? { Authorization: `Bearer ${webhookToken}` } : {}),
    },
    body: JSON.stringify({
      to: notifyEmail,
      subject,
      text,
    }),
  });

  if (!res.ok) {
    return new Response(await res.text(), { status: 502 });
  }
  return new Response("ok");
});
```

O corpo (`to`, `subject`, `text`) é genérico. Ajuste os nomes dos campos ao webhook que você já tiver, sem abrir conta nova.

## 4. Database Webhook

No painel do Viral Data: Database → Webhooks → Create webhook.

- Tabela: `public.site_applications`
- Eventos: **INSERT** apenas
- Tipo: HTTP Request, ou Supabase Edge Function se o painel oferecer a função `notify-application`
- Método: POST
- Cabeçalho de autorização do webhook (o painel gera um secret; a função pode conferir, se quiser)

O webhook usa a service role por baixo e lê a linha mesmo sem policy de SELECT para `anon`.

## 5. Conferir

1. Copie a URL e a anon key do projeto Viral Data (Settings → API) para `aplicar/config.js`. Os valores no example continuam placeholder. Envie uma aplicação de teste em `/aplicar`.
2. A linha aparece em Table Editor → `site_applications`.
3. Se a função estiver no ar, `NOTIFY_EMAIL` recebe o aviso. Se o webhook falhar, a linha continua salva: o formulário não espera o e-mail.
