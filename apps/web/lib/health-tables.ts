/**
 * Tables /api/health checks, and the column its 24h / 7d / latest figures read.
 *
 * Every column must exist in supabase/migrations: PostgREST rejects an unknown
 * column, and health used to read that rejection as "0 rows, latest never".
 * tests/health-tables.test.mjs pins each column against the migrations.
 */

export interface HealthTable {
  table: string
  /** null: the table has no date column, so only its row count is checked. */
  dateColumn: string | null
}

export const HEALTH_TABLES: readonly HealthTable[] = [
  { table: "wards", dateColumn: null },
  { table: "elected_reps", dateColumn: null },
  // start_date and end_date are when the work ran, not when the row was loaded.
  { table: "bbmp_work_orders", dateColumn: null },
  { table: "contractor_profiles", dateColumn: "updated_at" },
  { table: "ward_reports", dateColumn: "reported_at" },
  { table: "ask_kaun_logs", dateColumn: "asked_at" },
  { table: "civic_signals", dateColumn: "ingested_at" },
  { table: "community_facts", dateColumn: "created_at" },
  { table: "city_pulse_facts", dateColumn: "created_at" },
  { table: "ward_grievances", dateColumn: null },
  // The KPPP publish date, which the weekly KPPP job (scripts/adapters/kppp.mjs)
  // uses as its cursor. It measures when tenders were published, not when they
  // were loaded (the table has no load time), and only to the day.
  { table: "tenders", dateColumn: "issued_date" },
]

export interface TableCheck {
  table: string
  /** What recent_24h, recent_7d and latest_at measure; null when they are not tracked. */
  date_column: string | null
  total: number | null
  recent_24h: number | null
  recent_7d: number | null
  latest_at: string | null
  status: "ok" | "empty" | "error"
  /** Why the check failed, one entry per failed query. Present only when status is "error". */
  errors?: string[]
}

interface QueryResult {
  count?: number | null
  data?: unknown
  error: { message?: string } | null
  status?: number
}

/**
 * A HEAD count request that fails has no body, so supabase-js reports an empty
 * message, and a missing table comes back as no error with no count. Both are
 * failures here.
 */
function failure(query: string, result: QueryResult, needsCount: boolean): string | null {
  if (result.error) return `${query}: ${result.error.message || `HTTP ${result.status ?? "error"}`}`
  if (needsCount && typeof result.count !== "number") return `${query}: no count returned`
  return null
}

export async function checkTable(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  { table, dateColumn }: HealthTable,
  now = Date.now(),
): Promise<TableCheck> {
  const check: TableCheck = {
    table,
    date_column: dateColumn,
    total: null,
    recent_24h: null,
    recent_7d: null,
    latest_at: null,
    status: "error",
  }
  const errors: string[] = []
  const count = (query: string, result: QueryResult): number | null => {
    const failed = failure(query, result, true)
    if (failed) errors.push(failed)
    return failed ? null : (result.count as number)
  }

  try {
    check.total = count("total", await supabase
      .from(table)
      .select("*", { count: "exact", head: true }))

    if (dateColumn) {
      const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString()
      check.recent_24h = count(`recent_24h (${dateColumn})`, await supabase
        .from(table)
        .select("*", { count: "exact", head: true })
        .gte(dateColumn, since24h))

      const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
      check.recent_7d = count(`recent_7d (${dateColumn})`, await supabase
        .from(table)
        .select("*", { count: "exact", head: true })
        .gte(dateColumn, since7d))

      // Newest non-null value: a descending sort puts NULLs first by default.
      const latest: QueryResult = await supabase
        .from(table)
        .select(dateColumn)
        .order(dateColumn, { ascending: false, nullsFirst: false })
        .limit(1)
      const failed = failure(`latest_at (${dateColumn})`, latest, false)
      if (failed) errors.push(failed)
      else check.latest_at = (latest.data as Array<Record<string, string | null>> | null)?.[0]?.[dateColumn] ?? null
    }
  } catch (e) {
    errors.push(`${table}: ${e instanceof Error ? e.message : String(e)}`)
  }

  if (errors.length > 0) return { ...check, errors }
  return { ...check, status: (check.total ?? 0) > 0 ? "ok" : "empty" }
}
