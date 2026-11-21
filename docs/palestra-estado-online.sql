-- Palestra (viralmindlabs.com/palestra): estado do editor salvo online.
-- Projeto Supabase: Viral Data (qclvrddrqulgfzccndnl).
--
-- O que cria:
--   1. public.palestra_estado: 1 linha por deck (id 'palestra'), com o estado salvo pelo editor
--      (ordem dos slides, textos, notas) e a versão do deck (meta deck-rev) em que foi salvo.
--      Leitura pública (anon SELECT). Nenhuma escrita direta: anon/authenticated não têm INSERT/UPDATE/DELETE.
--   2. palestra_priv.senha_edicao: hash bcrypt da senha de edição. Schema fora da API (não exposto no PostgREST),
--      sem nenhum grant para anon/authenticated.
--   3. public.salvar_palestra_estado(p_senha, p_versao, p_estado): SECURITY DEFINER, confere a senha
--      contra o hash e grava (upsert) o estado. Retorna o updated_at gravado.
--   4. public.limpar_palestra_estado(p_senha): SECURITY DEFINER, confere a senha e apaga o estado online
--      (usado pelo "Restaurar original").
--
-- A senha NÃO está neste arquivo nem no repositório. O hash é inserido num passo separado, fora do repo:
--   insert into palestra_priv.senha_edicao (id, hash) values ('palestra', '<hash bcrypt $2a$>');
-- Enquanto não houver hash, todo salvamento online é recusado (o deck continua salvando só no navegador).

create extension if not exists pgcrypto with schema extensions;

-- 1. estado público
create table if not exists public.palestra_estado (
  id          text primary key,
  versao      text not null,
  estado      jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.palestra_estado enable row level security;

drop policy if exists palestra_estado_leitura_publica on public.palestra_estado;
create policy palestra_estado_leitura_publica on public.palestra_estado
  for select to anon, authenticated using (true);

revoke all on public.palestra_estado from anon, authenticated;
grant select on public.palestra_estado to anon, authenticated;

-- 2. senha (privado)
create schema if not exists palestra_priv;
revoke all on schema palestra_priv from public, anon, authenticated;

create table if not exists palestra_priv.senha_edicao (
  id          text primary key,
  hash        text not null,
  updated_at  timestamptz not null default now()
);
revoke all on palestra_priv.senha_edicao from public, anon, authenticated;

-- 3. salvar
create or replace function public.salvar_palestra_estado(p_senha text, p_versao text, p_estado jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_at   timestamptz;
begin
  select s.hash into v_hash from palestra_priv.senha_edicao s where s.id = 'palestra';
  if v_hash is null or p_senha is null or length(p_senha) < 12
     or extensions.crypt(p_senha, v_hash) <> v_hash then
    raise exception 'senha_invalida' using errcode = '28P01';
  end if;
  if p_versao is null or length(p_versao) > 100 then
    raise exception 'versao_invalida' using errcode = '22023';
  end if;
  if p_estado is null or jsonb_typeof(p_estado) <> 'object' then
    raise exception 'estado_invalido' using errcode = '22023';
  end if;
  if octet_length(p_estado::text) > 15 * 1024 * 1024 then
    raise exception 'estado_grande_demais' using errcode = '54000';
  end if;

  insert into public.palestra_estado (id, versao, estado, updated_at)
  values ('palestra', p_versao, p_estado, now())
  on conflict (id) do update
    set versao = excluded.versao, estado = excluded.estado, updated_at = excluded.updated_at
  returning updated_at into v_at;
  return v_at;
end;
$$;

-- 4. limpar (Restaurar original)
create or replace function public.limpar_palestra_estado(p_senha text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
begin
  select s.hash into v_hash from palestra_priv.senha_edicao s where s.id = 'palestra';
  if v_hash is null or p_senha is null or length(p_senha) < 12
     or extensions.crypt(p_senha, v_hash) <> v_hash then
    raise exception 'senha_invalida' using errcode = '28P01';
  end if;
  delete from public.palestra_estado where id = 'palestra';
  return true;
end;
$$;

revoke all on function public.salvar_palestra_estado(text, text, jsonb) from public;
revoke all on function public.limpar_palestra_estado(text) from public;
grant execute on function public.salvar_palestra_estado(text, text, jsonb) to anon, authenticated;
grant execute on function public.limpar_palestra_estado(text) to anon, authenticated;

notify pgrst, 'reload schema';
