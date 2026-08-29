export type OverallHealth = "healthy" | "degraded" | "down"

export function deriveOverallHealth(input: {
  supabaseConnected: boolean
  hasTableErrors: boolean
  coreDataHealthy: boolean
  hasStalePipelines: boolean
}): OverallHealth {
  if (!input.supabaseConnected) return "down"
  if (input.hasTableErrors || !input.coreDataHealthy || input.hasStalePipelines) return "degraded"
  return "healthy"
}
