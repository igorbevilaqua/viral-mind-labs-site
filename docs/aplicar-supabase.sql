-- Aplicações de https://viralmindlabs.com/aplicar
-- Projeto Supabase: Viral Data
--
-- Rode este arquivo inteiro no SQL Editor do projeto Viral Data.
-- Não há nada aqui que rode sozinho a partir do repositório.
--
-- O site faz POST em /rest/v1/site_applications com Prefer: return=minimal.
-- Por isso NÃO existe policy de SELECT: o insert não devolve a linha.
-- service_role (painel, webhook, edge function) ignora RLS e continua lendo.

create table if not exists public.site_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nome text not null,
  email text not null,
  ddi text not null,
  whatsapp text not null,
  empresa text not null,
  ramo text not null,
  instagram text not null,
  faturamento text not null,
  obs text,
  consent boolean not null,
  user_agent text,
  utm jsonb,
  constraint site_applications_faturamento_chk
    check (faturamento in ('ate500', '500a1m', '1a5m', 'acima5m')),
  constraint site_applications_consent_chk
    check (consent is true)
);

comment on table public.site_applications is
  'Leads enviados por viralmindlabs.com/aplicar. INSERT anônimo; leitura só via service_role.';

create index if not exists site_applications_created_at_idx
  on public.site_applications (created_at desc);

alter table public.site_applications enable row level security;

revoke all on table public.site_applications from public;
revoke all on table public.site_applications from anon, authenticated;
grant insert on table public.site_applications to anon;

drop policy if exists site_applications_anon_insert on public.site_applications;

create policy site_applications_anon_insert
  on public.site_applications
  for insert
  to anon
  with check (
    consent is true
    and char_length(btrim(nome)) between 2 and 160
    and char_length(btrim(email)) between 6 and 320
    and position('@' in email) > 1
    and char_length(btrim(ddi)) between 1 and 6
    and char_length(btrim(whatsapp)) between 8 and 48
    and char_length(btrim(empresa)) between 1 and 200
    and char_length(btrim(ramo)) between 1 and 200
    and char_length(btrim(instagram)) between 1 and 300
    and faturamento in ('ate500', '500a1m', '1a5m', 'acima5m')
    and (obs is null or char_length(obs) <= 4000)
    and (user_agent is null or char_length(user_agent) <= 512)
  );

-- Sem policy de SELECT, UPDATE ou DELETE para anon/authenticated.
-- Honeypot é rejeitado no browser e não vira coluna.
