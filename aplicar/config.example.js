// Copie este arquivo para aplicar/config.js (está no .gitignore).
//
// Alvo: o projeto Supabase "Viral Data", o que o time já usa para os dados
// da Viral Mind Labs. Não criar projeto novo. A tabela public.site_applications
// entra nesse projeto (docs/aplicar-supabase.sql).
//
// Preencha com a Project URL e a anon key de Settings → API do Viral Data.
// Os valores abaixo são placeholders de propósito. A anon key é pública no
// browser; o RLS só deixa o anon fazer INSERT.
//
// O deploy da Hostinger segue o git e NÃO envia arquivo gitignored.
// Depois que Igor aprovar o merge, suba aplicar/config.js pelo
// gerenciador de arquivos da Hostinger, em public_html/aplicar/config.js.
window.VML_SUPABASE = {
  url: "https://YOUR_PROJECT_REF.supabase.co",
  anonKey: "YOUR_SUPABASE_ANON_KEY",
};
