-- Palestra: senha de publicação escolhida pelo Igor (curta). Remove a exigência de 12+ caracteres nas RPCs.
-- Aplicar depois de docs/palestra-estado-online.sql. O hash novo é inserido fora do repo (a senha não fica aqui).
-- O resto continua igual: leitura pública, sem escrita direta na tabela, escrita só pelas RPCs com senha, limite de 15 MB.

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
  if v_hash is null or p_senha is null
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
  if v_hash is null or p_senha is null
     or extensions.crypt(p_senha, v_hash) <> v_hash then
    raise exception 'senha_invalida' using errcode = '28P01';
  end if;
  delete from public.palestra_estado where id = 'palestra';
  return true;
end;
$$;

notify pgrst, 'reload schema';
