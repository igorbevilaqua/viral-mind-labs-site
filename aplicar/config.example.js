// Production keys live in aplicar/config.js (anon is public).
//
// Alvo: o projeto Supabase "Viral Data", o que o time já usa para os dados
// da Viral Mind Labs. Não criar projeto novo. A tabela public.site_applications
// entra nesse projeto (docs/aplicar-supabase.sql).
//
// Preencha com a Project URL e a anon key de Settings → API do Viral Data.
// Os valores abaixo são placeholders de propósito. A anon key é pública no
// browser; o RLS só deixa o anon fazer INSERT.
//
// Production keys live in aplicar/config.js (anon is public). Hostinger git
// deploy serves that file; these placeholders stay out of production.
window.VML_SUPABASE = {
  url: "https://YOUR_PROJECT_REF.supabase.co",
  anonKey: "YOUR_SUPABASE_ANON_KEY",
};
