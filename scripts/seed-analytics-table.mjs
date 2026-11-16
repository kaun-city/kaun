#!/usr/bin/env node
/**
 * seed-analytics-table.mjs — Create analytics_events table and RPC function.
 *
 * Run once: node scripts/seed-analytics-table.mjs
 * Env:      SUPABASE_MANAGEMENT_TOKEN
 */

import { dbQuery } from "./lib/db.mjs"

await dbQuery(`
  CREATE TABLE IF NOT EXISTS analytics_events (
    id         BIGSERIAL PRIMARY KEY,
    event      TEXT NOT NULL,
    ward_no    INTEGER,
    ward_name  TEXT,
    meta       JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_analytics_event_created
    ON analytics_events (event, created_at DESC);
`)
console.log("Table analytics_events ready.")

await dbQuery(`
  CREATE OR REPLACE FUNCTION top_pin_drop_wards(p_days INTEGER DEFAULT 7)
  RETURNS TABLE(ward_name TEXT, count BIGINT)
  LANGUAGE sql STABLE AS $$
    SELECT ward_name, COUNT(*) as count
    FROM analytics_events
    WHERE event = 'pin_drop'
      AND ward_name IS NOT NULL
      AND created_at >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY ward_name
    ORDER BY count DESC
    LIMIT 10;
  $$;
`)
console.log("RPC top_pin_drop_wards ready.")

// Tracking writes use the server-only service role.
await dbQuery(`
  ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "Allow anon inserts" ON analytics_events;
  REVOKE INSERT ON public.analytics_events FROM PUBLIC, anon, authenticated;
`)
console.log("RLS enabled; anonymous tracking writes disabled.")
