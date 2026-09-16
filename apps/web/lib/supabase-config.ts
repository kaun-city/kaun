// The anon key is intentionally public and already ships to the browser.
// Centralising the fallback keeps local server routes aligned with the client.
export const DEFAULT_SUPABASE_URL = "https://xgygxfyfsvccqqmtboeu.supabase.co"
export const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhneWd4Znlmc3ZjY3FxbXRib2V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NDg1NzIsImV4cCI6MjA4ODEyNDU3Mn0.5dzsC5-Ex-Umk-9DTM5xNsQB-t0my-MtWq9WUPhidD4"

export function publicSupabaseConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? DEFAULT_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? DEFAULT_SUPABASE_ANON_KEY,
  }
}
