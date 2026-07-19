// =====================================================================
// Configuración de Supabase
// =====================================================================
// 1) Creá un proyecto en https://supabase.com
// 2) Abrí el SQL Editor y ejecutá el contenido de schema.sql
// 3) Andá a Settings > API y copiá el "Project URL" y la "anon public key"
// 4) Pegalos abajo, reemplazando los placeholders
// =====================================================================

export const SUPABASE_URL = 'https://kjzqcwexvmsvlzmzlyyu.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqenFjd2V4dm1zdmx6bXpseXl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MTY4NDQsImV4cCI6MjA5OTk5Mjg0NH0.rL1VieR0ispu_MIExP-3NVfZqVlNwS9J5d1jCZJC0Lk';

export function supabaseConfigurado() {
  return (
    SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    !SUPABASE_URL.includes('YOUR_SUPABASE_URL') &&
    !SUPABASE_ANON_KEY.includes('YOUR_SUPABASE_ANON_KEY')
  );
}
