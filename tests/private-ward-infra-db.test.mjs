import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { seedLoadArgs, infraRelocationMigration } from '../scripts/local-db/shared.mjs'

const hasPostgres = ['initdb', 'pg_ctl', 'psql'].every(cmd => {
  try { execFileSync('which', [cmd], { stdio: 'ignore' }); return true } catch { return false }
})

test('private infra preserves reads, dependencies, refresh and role boundaries', { skip: !hasPostgres }, t => {
  const dir = mkdtempSync(join(tmpdir(), 'kaun-infra-test-'))
  const db = join(dir, 'db')
  const pg = args => execFileSync('psql', ['-X', '-h', dir, '-p', '55459', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  let started = false
  try {
    execFileSync('initdb', ['-D', db, '-A', 'trust', '-U', 'postgres'], { stdio: 'ignore' })
    execFileSync('pg_ctl', ['-D', db, '-o', `-k ${dir} -p 55459 -h ''`, '-l', join(dir, 'log'), 'start'], { stdio: 'ignore' })
    started = true
    pg(['-c', `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.fixture(ward_no integer, ward_name text, signal_count bigint, bus_stop_count bigint, daily_trips bigint);
      INSERT INTO fixture VALUES (1,'First',3,2,12),(2,'Empty',0,0,0);
      CREATE MATERIALIZED VIEW public.ward_infra_stats AS SELECT * FROM fixture;
      CREATE UNIQUE INDEX idx_ward_infra_stats_ward_no ON public.ward_infra_stats(ward_no);
      GRANT SELECT ON public.ward_infra_stats TO anon, authenticated, service_role;
      CREATE VIEW public.ward_bus_stops WITH (security_invoker=true) AS SELECT ward_no, bus_stop_count::integer AS stop_count, daily_trips AS total_trips FROM public.ward_infra_stats WHERE bus_stop_count > 0;
      GRANT SELECT ON public.ward_bus_stops TO anon, authenticated, service_role;
      CREATE FUNCTION public.refresh_ward_infra_stats() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN REFRESH MATERIALIZED VIEW public.ward_infra_stats; END $$;
      REVOKE ALL ON FUNCTION public.refresh_ward_infra_stats() FROM PUBLIC, anon, authenticated;
      GRANT EXECUTE ON FUNCTION public.refresh_ward_infra_stats() TO service_role;`])
    const read = role => pg(['-c', `SET ROLE ${role}; SELECT row_to_json(t) FROM (SELECT * FROM public.ward_infra_stats ORDER BY ward_no) t; SELECT row_to_json(t) FROM (SELECT * FROM public.ward_bus_stops ORDER BY ward_no) t`])
    const before = Object.fromEntries(['anon','authenticated','service_role'].map(role => [role, read(role)]))
    const oldOid = pg(['-c', "SELECT 'public.ward_infra_stats'::regclass::oid"])
    const migration = resolve('supabase/migrations', infraRelocationMigration)
    pg(['--single-transaction', '-f', migration])
    assert.equal(pg(['-c', "SELECT 'kaun_private.ward_infra_stats'::regclass::oid"]), oldOid)
    assert.equal(pg(['-c', "SELECT n.nspname FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='idx_ward_infra_stats_ward_no'"]), 'kaun_private')
    for (const role of Object.keys(before)) assert.equal(read(role), before[role])
    assert.equal(pg(['-c', "SELECT reloptions FROM pg_class WHERE oid='public.ward_infra_stats'::regclass"]), '{security_invoker=true}')
    assert.equal(pg(['-c', "SELECT has_schema_privilege('anon','kaun_private','CREATE'),has_table_privilege('anon','kaun_private.ward_infra_stats','SELECT'),has_function_privilege('anon','public.refresh_ward_infra_stats()','EXECUTE')"]), 'f|t|f')
    assert.throws(() => pg(['-c', 'SET ROLE anon; SELECT public.refresh_ward_infra_stats()']), /permission denied/)
    assert.throws(() => pg(['-c', "SET ROLE anon; CREATE TABLE kaun_private.bad(id int)"]), /permission denied/)
    assert.throws(() => pg(['-c', "SET ROLE anon; UPDATE public.ward_infra_stats SET signal_count=0"]), /cannot update|permission denied/)
    pg(['-c', "UPDATE fixture SET bus_stop_count=4, daily_trips=22 WHERE ward_no=1; SET ROLE service_role; SELECT public.refresh_ward_infra_stats()"])
    assert.equal(pg(['-c', 'SET ROLE anon; SELECT stop_count,total_trips FROM public.ward_bus_stops']), '4|22')
    // Replay an unexpected second application atomically: existing API survives.
    assert.throws(() => pg(['--single-transaction', '-f', migration]), /kaun_private already exists/)
    assert.equal(pg(['-c', 'SET ROLE anon; SELECT stop_count,total_trips FROM public.ward_bus_stops']), '4|22')
    // Seed workflow restores the old shape, runs the historic replay, then relocates again.
    const args = seedLoadArgs('/tmp/seed.sql')
    assert.ok(args.indexOf('/tmp/kaun-replay-20260917_bmtc_stops_dedup.sql') < args.indexOf(`/tmp/kaun-replay-${infraRelocationMigration}`))
    pg(['-c', "DROP VIEW public.ward_bus_stops; DROP VIEW public.ward_infra_stats; ALTER MATERIALIZED VIEW kaun_private.ward_infra_stats SET SCHEMA public; DROP SCHEMA kaun_private; CREATE VIEW public.ward_bus_stops WITH (security_invoker=true) AS SELECT ward_no, bus_stop_count::integer AS stop_count, daily_trips AS total_trips FROM public.ward_infra_stats WHERE bus_stop_count > 0; GRANT SELECT ON public.ward_bus_stops TO anon, authenticated, service_role;"])
    pg(['--single-transaction', '-f', migration])
    assert.equal(pg(['-c', 'SET ROLE anon; SELECT stop_count,total_trips FROM public.ward_bus_stops']), '4|22')
    // Run the actual seed command sequence and historical BMTC SQL with PostGIS.
    let hasPostgis = false
    try { hasPostgis = existsSync(join(execFileSync('pg_config', ['--sharedir'], { encoding: 'utf8' }).trim(), 'extension/postgis.control')) } catch {}
    if (!hasPostgis) {
      t.diagnostic('PostGIS unavailable: full historical seed replay was not tested')
      return
    }
    pg(['-c', `CREATE EXTENSION postgis;
      CREATE TABLE public.ward_boundaries(ward_no integer, ward_name text, geom geometry(MultiPolygon,4326));
      CREATE TABLE public.traffic_signals(id integer, lat double precision, lng double precision);
      CREATE TABLE public.bmtc_stops(id integer PRIMARY KEY, city_id text, stop_name text, lat double precision, lng double precision, trips integer, routes text, boothcode text, ac_number integer, assembly_constituency text);`])
    const seed = join(dir, 'seed.sql')
    writeFileSync(seed, `INSERT INTO public.ward_boundaries VALUES (1,'First',ST_Multi(ST_GeomFromText('POLYGON((0 0,0 2,2 2,2 0,0 0))',4326)));
      INSERT INTO public.traffic_signals VALUES (1,1,1);
      INSERT INTO public.bmtc_stops VALUES (1,'bengaluru','Stop',1,1,12,'1',NULL,NULL,NULL);
      INSERT INTO public.ward_bus_stops VALUES (1,1,12);`)
    const seedArgs = seedLoadArgs(seed).map(arg => arg.startsWith('/tmp/kaun-replay-') ? resolve('supabase/migrations', arg.replace('/tmp/kaun-replay-', '')) : arg)
    pg(seedArgs)
    assert.equal(pg(['-c', 'SET ROLE anon; SELECT ward_no,signal_count,bus_stop_count,daily_trips FROM public.ward_infra_stats']), '1|1|1|12')
    assert.equal(pg(['-c', 'SET ROLE anon; SELECT * FROM public.ward_bus_stops']), '1|1|12')
    pg(['-c', "UPDATE public.bmtc_stops SET trips=30 WHERE id=1; SET ROLE service_role; SELECT public.refresh_ward_infra_stats()"])
    assert.equal(pg(['-c', 'SET ROLE anon; SELECT total_trips FROM public.ward_bus_stops']), '30')
  } finally {
    if (started) execFileSync('pg_ctl', ['-D', db, '-m', 'immediate', 'stop'], { stdio: 'ignore' })
    rmSync(dir, { recursive: true, force: true })
  }
})
