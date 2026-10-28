// Copie este arquivo para aplicar/config.js (está no .gitignore) e preencha
// com o projeto Supabase "Viral Data".
//
// A anon key é pública no browser de propósito. A proteção é o RLS:
// anon só pode INSERT em public.site_applications (ver docs/aplicar-supabase.sql).
//
// O deploy da Hostinger segue o git e NÃO envia arquivo gitignored.
// Depois que Igor aprovar o merge, suba aplicar/config.js pelo
// gerenciador de arquivos da Hostinger, em public_html/aplicar/config.js.
window.VML_SUPABASE = {
  url: "https://YOUR_PROJECT_REF.supabase.co",
  anonKey: "YOUR_SUPABASE_ANON_KEY",
};
