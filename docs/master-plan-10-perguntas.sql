-- Master Plan VM: formulário com 10 perguntas (pedido do Igor, 20/11/2026 20h29).
-- Novas: empresa (nome da empresa) e produto_servico. Instagram da empresa opcional. TikTok removido.
-- Projeto: Viral Data (qclvrddrqulgfzccndnl). Rodar ANTES do merge do PR.
-- Compatível com a página anterior (v3): ela continua sendo aceita.

begin;

-- Trava: a policy atual tem que ser a da migration de 9 perguntas.
do $$
declare v text;
begin
  select pg_get_expr(polwithcheck, polrelid) into v
  from pg_policy
  where polrelid = 'public.site_master_plan_applications'::regclass
    and polname = 'site_master_plan_applications_anon_insert';
  if v is null
     or position('(primeira_impressao IS NULL)' in v) = 0
     or position('char_length(btrim(instagram))' in v) = 0
     or position('nao_tem_tiktok IS TRUE' in v) = 0 then
    raise exception 'Policy site_master_plan_applications_anon_insert diferente do esperado; revisar antes.';
  end if;
end $$;

alter table public.site_master_plan_applications
  add column if not exists empresa text,
  add column if not exists produto_servico text,
  alter column instagram drop not null,
  alter column nao_tem_tiktok drop not null;

-- TikTok saiu do formulário: a regra antiga exigia link ou "não tenho".
alter table public.site_master_plan_applications
  drop constraint if exists site_master_plan_applications_tiktok_chk;
alter table public.site_master_plan_applications
  add constraint site_master_plan_applications_tiktok_chk
  check (tiktok is null or char_length(tiktok) <= 300);

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
    and (empresa is null or char_length(btrim(empresa)) between 1 and 200)
    and char_length(btrim(papel)) between 1 and 200
    and faturamento = any (array['ate500', '500a1m', '1a5m', 'acima5m'])
    and (produto_servico is null or char_length(btrim(produto_servico)) between 1 and 1000)
    and (instagram is null or char_length(instagram) <= 300)
    and (tiktok is null or char_length(tiktok) <= 300)
    and char_length(btrim(reconhecido)) between 1 and 4000
    and (primeira_impressao is null or char_length(primeira_impressao) <= 4000)
    and (deseja_que_pensem is null or char_length(deseja_que_pensem) <= 4000)
    and char_length(btrim(publico_desejado)) between 1 and 4000
    and (user_agent is null or char_length(user_agent) <= 512)
  );

commit;

notify pgrst, 'reload schema';

-- Obs.: empresa e produto_servico são obrigatórias na página, mas opcionais no banco
-- para não recusar envios da versão anterior que ainda esteja aberta em algum celular.
