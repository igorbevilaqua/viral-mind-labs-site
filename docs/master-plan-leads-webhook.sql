-- Leva cada aplicação do Master Plan VM para o CRM, pelo mesmo caminho do /aplicar.
--
-- Alvo: projeto Supabase Viral Data (qclvrddrqulgfzccndnl). Este repositório NÃO executa o SQL.
--
-- ORDEM (não pular):
--   1. Viral Data: docs/master-plan-supabase.sql (cria public.site_master_plan_applications).
--   2. CRM (viral-crm-v2-supabase): migration da RPC sales_receive_master_plan_application
--      e deploy da edge function site-application-intake que entende a tabela nova.
--   3. Viral Data: este arquivo.
--   Se o passo 3 rodar antes do 2, o CRM antigo trataria a linha como se fosse do /aplicar.
--
-- Como funciona hoje no /aplicar: o trigger envio_leads em public.site_applications
-- (Database Webhook, supabase_functions.http_request) faz POST na edge function
-- site-application-intake do CRM, com o header x-intake-secret.
--
-- Este arquivo cria o trigger irmão envio_leads_master_plan copiando a definição do
-- envio_leads que já está no banco. Assim o segredo nunca entra no repositório, e
-- URL, header e timeout ficam idênticos. O payload do webhook traz "table", e é por ele
-- que o CRM separa as duas origens.
--
-- O Cockpit (/aplicacoes) lê a tabela direto com service role: não precisa de nada aqui.

do $$
declare
  def text;
begin
  if to_regclass('public.site_master_plan_applications') is null then
    raise exception 'Rode docs/master-plan-supabase.sql antes (falta public.site_master_plan_applications).';
  end if;

  select pg_get_triggerdef(t.oid)
    into def
    from pg_trigger t
   where t.tgrelid = 'public.site_applications'::regclass
     and t.tgname = 'envio_leads'
     and not t.tgisinternal;

  if def is null then
    raise exception 'Trigger envio_leads não encontrado em public.site_applications. Nada foi criado.';
  end if;

  def := replace(def, 'CREATE TRIGGER envio_leads ', 'CREATE TRIGGER envio_leads_master_plan ');
  def := replace(def, ' ON public.site_applications ', ' ON public.site_master_plan_applications ');

  if def not like 'CREATE TRIGGER envio_leads_master_plan AFTER INSERT ON public.site_master_plan_applications %' then
    raise exception 'Definição inesperada do envio_leads, revisar à mão: %', left(def, 120);
  end if;

  execute 'drop trigger if exists envio_leads_master_plan on public.site_master_plan_applications';
  execute def;
end
$$;

-- Conferir (não mostra o segredo):
-- select tgname, tgrelid::regclass from pg_trigger
--  where tgname in ('envio_leads', 'envio_leads_master_plan');
--
-- Desfazer:
-- drop trigger if exists envio_leads_master_plan on public.site_master_plan_applications;
