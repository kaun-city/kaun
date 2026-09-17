// The anon key is intentionally public and already ships to the browser.
// Centralising the fallback keeps local server routes aligned with the client.
export const DEFAULT_SUPABASE_URL = "https://xgygxfyfsvccqqmtboeu.supabase.co"
export const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhneWd4Znlmc3ZjY3FxbXRib2V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NDg1NzIsImV4cCI6MjA4ODEyNDU3Mn0.5dzsC5-Ex-Umk-9DTM5xNsQB-t0my-MtWq9WUPhidD4"

/**
 * Where the browser reaches Supabase: same-origin on kaun.city, which
 * next.config.ts rewrites to the project. Some Indian networks cannot connect
 * to *.supabase.co at all (see PR #123), so no visitor's browser should depend
 * on it. It sits under /api/ because host routing never touches /api/* on any
 * host (lib/host-routing.ts). Server code keeps calling Supabase directly.
 */
export const DB_PROXY_PATH = "/api/db"

/**
 * Values pasted into a dashboard can carry a trailing newline. In production
 * NEXT_PUBLIC_SUPABASE_URL did: browsers strip it from fetch URLs, but it would
 * end up in a rewrite destination or a stored photo URL.
 */
function clean(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

export function publicSupabaseConfig() {
  return {
    url: clean(process.env.NEXT_PUBLIC_SUPABASE_URL, DEFAULT_SUPABASE_URL).replace(/\/+$/, ""),
    anonKey: clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_ANON_KEY),
  }
}

/**
 * A public Supabase Storage URL (report photos) rewritten to the same-origin
 * proxy. Anything else passes through unchanged.
 */
export function proxiedStorageUrl(url: string, supabaseUrl = publicSupabaseConfig().url): string {
  const prefix = `${supabaseUrl}/storage/v1/object/public/`
  return url.startsWith(prefix) ? `${DB_PROXY_PATH}/storage/v1/object/public/${url.slice(prefix.length)}` : url
}
