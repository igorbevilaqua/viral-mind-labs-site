-- Aplicações de https://viralmindlabs.com/aplicar-masterplan-vm/
--
-- Alvo: o projeto Supabase que o time JÁ USA para os dados da Viral Mind Labs,
-- de nome "Viral Data". Não criar projeto novo.
-- A tabela public.site_master_plan_applications entra nesse projeto, ao lado
-- de public.site_applications (docs/aplicar-supabase.sql).
--
-- Quem for aplicar: abrir o SQL Editor do Viral Data e rodar este arquivo inteiro.
-- Este repositório NÃO executa o SQL. Não rodar daqui.
-- URL e anon key continuam em aplicar/config.js (Settings → API do Viral Data).
--
-- O site faz POST em /rest/v1/site_master_plan_applications com Prefer: return=minimal.
-- Por isso NÃO existe policy de SELECT: o insert não devolve a linha.
-- service_role (painel, webhook, edge function) ignora RLS e continua lendo.
--
-- Sem a tabela no Viral Data, o envio da página falha de forma explícita.

create table if not exists public.site_master_plan_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nome text not null,
  email text not null,
  ddi text not null,
  whatsapp text not null,
  faturamento text not null,
  papel text not null,
  instagram text not null,
  tiktok text,
  nao_tem_tiktok boolean not null default false,
  reconhecido text not null,
  primeira_impressao text not null,
  deseja_que_pensem text not null,
  publico_desejado text not null,
  consent boolean not null,
  user_agent text,
  utm jsonb,
  constraint site_master_plan_applications_faturamento_chk
    check (faturamento in ('ate500', '500a1m', '1a5m', 'acima5m')),
  constraint site_master_plan_applications_consent_chk
    check (consent is true),
  constraint site_master_plan_applications_tiktok_chk
    check (
      (nao_tem_tiktok is true and (tiktok is null or btrim(tiktok) = ''))
      or (nao_tem_tiktok is false and char_length(btrim(tiktok)) between 1 and 300)
    )
);

comment on table public.site_master_plan_applications is
  'Leads de viralmindlabs.com/aplicar-masterplan-vm, no projeto Supabase existente Viral Data. INSERT anônimo; leitura só via service_role.';

create index if not exists site_master_plan_applications_created_at_idx
  on public.site_master_plan_applications (created_at desc);

alter table public.site_master_plan_applications enable row level security;

revoke all on table public.site_master_plan_applications from public;
revoke all on table public.site_master_plan_applications from anon, authenticated;
grant insert on table public.site_master_plan_applications to anon;

drop policy if exists site_master_plan_applications_anon_insert
  on public.site_master_plan_applications;

create policy site_master_plan_applications_anon_insert
  on public.site_master_plan_applications
  for insert
  to anon
  with check (
    consent is true
    and char_length(btrim(nome)) between 2 and 160
    and char_length(btrim(email)) between 6 and 320
    and position('@' in email) > 1
    and char_length(btrim(ddi)) between 1 and 6
    and char_length(btrim(whatsapp)) between 8 and 48
    and faturamento in ('ate500', '500a1m', '1a5m', 'acima5m')
    and char_length(btrim(papel)) between 1 and 200
    and char_length(btrim(instagram)) between 1 and 300
    and (
      (nao_tem_tiktok is true and (tiktok is null or btrim(tiktok) = ''))
      or (nao_tem_tiktok is false and char_length(btrim(tiktok)) between 1 and 300)
    )
    and char_length(btrim(reconhecido)) between 1 and 4000
    and char_length(btrim(primeira_impressao)) between 1 and 4000
    and char_length(btrim(deseja_que_pensem)) between 1 and 4000
    and char_length(btrim(publico_desejado)) between 1 and 4000
    and (user_agent is null or char_length(user_agent) <= 512)
  );

-- Sem policy de SELECT, UPDATE ou DELETE para anon/authenticated.
-- Honeypot é rejeitado no browser e não vira coluna.
