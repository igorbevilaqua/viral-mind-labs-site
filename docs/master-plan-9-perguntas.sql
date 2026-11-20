-- Master Plan VM: formulário passa de 11 para 9 perguntas (decisão do Igor, 20/11/2026 20h07).
-- Saem da tela: primeira_impressao e deseja_que_pensem. As colunas FICAM (histórico),
-- mas viram opcionais, e a policy de insert do anon deixa de exigir as duas.
-- Projeto: Viral Data (qclvrddrqulgfzccndnl). NÃO EXECUTADO. Rodar ANTES do merge do PR 20.
-- Não há CHECK constraint nessas colunas (só NOT NULL + policy), conferido em 20/11 20h.

begin;

-- Trava de segurança: aborta se a policy atual não for a que conferimos.
do $$
declare v text;
begin
  select pg_get_expr(polwithcheck, polrelid) into v
  from pg_policy
  where polrelid = 'public.site_master_plan_applications'::regclass
    and polname = 'site_master_plan_applications_anon_insert';
  if v is null
     or position('char_length(btrim(primeira_impressao))' in v) = 0
     or position('char_length(btrim(deseja_que_pensem))' in v) = 0 then
    raise exception 'Policy site_master_plan_applications_anon_insert diferente do esperado; revisar antes.';
  end if;
end $$;

alter table public.site_master_plan_applications
  alter column primeira_impressao drop not null,
  alter column deseja_que_pensem drop not null;

drop policy site_master_plan_applications_anon_insert on public.site_master_plan_applications;

create policy site_master_plan_applications_anon_insert
  on public.site_master_plan_applications
  as permissive
  for insert
  to anon
  with check (
    consent is true
    and char_length(btrim(nome)) between 2 and 160
    and char_length(btrim(email)) between 6 and 320
    and position('@' in email) > 1
    and char_length(btrim(ddi)) between 1 and 6
    and char_length(btrim(whatsapp)) between 8 and 48
    and faturamento = any (array['ate500', '500a1m', '1a5m', 'acima5m'])
    and char_length(btrim(papel)) between 1 and 200
    and char_length(btrim(instagram)) between 1 and 300
    and (
      (nao_tem_tiktok is true and (tiktok is null or btrim(tiktok) = ''))
      or (nao_tem_tiktok is false and char_length(btrim(tiktok)) between 1 and 300)
    )
    and char_length(btrim(reconhecido)) between 1 and 4000
    -- antes: obrigatórias (1 a 4000). Agora opcionais, com o mesmo teto.
    and (primeira_impressao is null or char_length(primeira_impressao) <= 4000)
    and (deseja_que_pensem is null or char_length(deseja_que_pensem) <= 4000)
    and char_length(btrim(publico_desejado)) between 1 and 4000
    and (user_agent is null or char_length(user_agent) <= 512)
  );

commit;

-- Conferência depois de rodar (leitura):
-- select column_name, is_nullable from information_schema.columns
--  where table_schema='public' and table_name='site_master_plan_applications'
--    and column_name in ('primeira_impressao','deseja_que_pensem');   -- esperado: YES, YES
-- select pg_get_expr(polwithcheck, polrelid) from pg_policy
--  where polname='site_master_plan_applications_anon_insert';
--
-- Rollback (só funciona se nenhuma linha nova tiver null nessas colunas):
-- alter table public.site_master_plan_applications
--   alter column primeira_impressao set not null, alter column deseja_que_pensem set not null;
-- e recriar a policy com as duas cláusulas originais:
--   char_length(btrim(primeira_impressao)) between 1 and 4000
--   char_length(btrim(deseja_que_pensem)) between 1 and 4000
