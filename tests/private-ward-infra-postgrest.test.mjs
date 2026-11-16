import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const bin = process.env.KAUN_POSTGREST_BIN
const secret = 'kaun-local-only-test-secret-32-bytes-long'
const token = role => {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
  const data = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role })}`
  return `${data}.${createHmac('sha256', secret).update(data).digest('base64url')}`
}
const freePort = () => new Promise((ok, fail) => {
  const server = createServer().listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => ok(port)) })
  server.on('error', fail)
})

test('PostgREST preserves public reads, refresh permissions and rollback', { skip: !bin, timeout: 30000 }, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'kaun-postgrest-'))
  const db = join(dir, 'db')
  const pgPort = await freePort()
  const apiPort = await freePort()
  const pg = args => execFileSync('psql', ['-X', '-h', '127.0.0.1', '-p', String(pgPort), '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  let server
  let started = false
  let logs = ''
  const request = async (path, role = 'anon', options = {}) => {
    const response = await fetch(`http://127.0.0.1:${apiPort}/${path}`, { ...options, headers: { Authorization: `Bearer ${token(role)}`, ...options.headers } })
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) : null }
  }
  const until = async fn => {
    for (let i = 0; i < 100; i++) {
      try { const value = await fn(); if (value) return value } catch {}
      await new Promise(ok => setTimeout(ok, 50))
    }
    throw new Error(`PostgREST did not reach expected state: ${logs}`)
  }
  try {
    execFileSync('initdb', ['-D', db, '-A', 'trust', '-U', 'postgres'], { stdio: 'ignore' })
    execFileSync('pg_ctl', ['-D', db, '-o', `-h 127.0.0.1 -p ${pgPort}`, '-l', join(dir, 'pg.log'), 'start'], { stdio: 'ignore' })
    started = true
    pg(['-c', `CREATE EXTENSION postgis;
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE authenticator LOGIN NOINHERIT;
      GRANT anon, authenticated, service_role TO authenticator;
      CREATE TABLE public.ward_boundaries(ward_no integer,ward_name text,geom geometry(MultiPolygon,4326));
      CREATE TABLE public.traffic_signals(id integer,lat double precision,lng double precision);
      CREATE TABLE public.bmtc_stops(id integer,lat double precision,lng double precision,trips integer);
      INSERT INTO public.ward_boundaries VALUES (1,'First',ST_Multi(ST_GeomFromText('POLYGON((0 0,0 2,2 2,2 0,0 0))',4326))), (2,'Empty',ST_Multi(ST_GeomFromText('POLYGON((3 3,3 5,5 5,5 3,3 3))',4326)));
      INSERT INTO public.traffic_signals VALUES (1,1,1);
      INSERT INTO public.bmtc_stops VALUES (1,1,1,12);
      CREATE MATERIALIZED VIEW public.ward_infra_stats AS
      SELECT wb.ward_no,wb.ward_name,
        (SELECT count(*) FROM public.traffic_signals ts WHERE public.st_within(public.st_setsrid(public.st_makepoint(ts.lng,ts.lat),4326),wb.geom)) AS signal_count,
        (SELECT count(*) FROM public.bmtc_stops bs WHERE public.st_within(public.st_setsrid(public.st_makepoint(bs.lng,bs.lat),4326),wb.geom)) AS bus_stop_count,
        (SELECT coalesce(sum(bs.trips),0)::bigint FROM public.bmtc_stops bs WHERE public.st_within(public.st_setsrid(public.st_makepoint(bs.lng,bs.lat),4326),wb.geom)) AS daily_trips
      FROM public.ward_boundaries wb;
      CREATE UNIQUE INDEX idx_ward_infra_stats_ward_no ON public.ward_infra_stats(ward_no);
      GRANT ALL ON public.ward_infra_stats TO anon,authenticated,service_role;
      CREATE VIEW public.ward_bus_stops WITH (security_invoker=true) AS SELECT ward_no,bus_stop_count::integer AS stop_count,daily_trips AS total_trips FROM public.ward_infra_stats WHERE bus_stop_count>0;
      GRANT SELECT ON public.ward_bus_stops TO anon,authenticated,service_role;
      CREATE FUNCTION public.refresh_ward_infra_stats() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN REFRESH MATERIALIZED VIEW public.ward_infra_stats; END $$;
      REVOKE ALL ON FUNCTION public.refresh_ward_infra_stats() FROM PUBLIC,anon,authenticated;
      GRANT EXECUTE ON FUNCTION public.refresh_ward_infra_stats() TO service_role;`])
    const config = join(dir, 'postgrest.conf')
    writeFileSync(config, `db-uri = "postgres://authenticator@127.0.0.1:${pgPort}/postgres"\ndb-schemas = "public"\ndb-anon-role = "anon"\njwt-secret = "${secret}"\nserver-host = "127.0.0.1"\nserver-port = ${apiPort}\n`)
    server = spawn(bin, [config], { stdio: ['ignore', 'pipe', 'pipe'] })
    server.stdout.on('data', c => { logs += c })
    server.stderr.on('data', c => { logs += c })
    const path = 'ward_infra_stats?select=ward_no,ward_name,signal_count,bus_stop_count,daily_trips&order=ward_no'
    const expected = [{ward_no:1,ward_name:'First',signal_count:1,bus_stop_count:1,daily_trips:12},{ward_no:2,ward_name:'Empty',signal_count:0,bus_stop_count:0,daily_trips:0}]
    await until(async () => (await request(path)).status === 200)
    for (const role of ['anon','authenticated','service_role']) assert.deepEqual(await request(path,role), {status:200,body:expected})
    pg(['--single-transaction', '-f', resolve('supabase/migrations/20261117_private_ward_infra.sql')])
    await until(async () => pg(['-c', "SELECT relkind FROM pg_class WHERE oid='public.ward_infra_stats'::regclass"]) === 'v' && (await request(path)).status === 200)
    for (const role of ['anon','authenticated','service_role']) assert.deepEqual(await request(path,role), {status:200,body:expected})
    assert.deepEqual(await request('ward_bus_stops?ward_no=eq.1&select=ward_no,stop_count,total_trips','anon',{headers:{Accept:'application/vnd.pgrst.object+json'}}), {status:200,body:{ward_no:1,stop_count:1,total_trips:12}})
    const hidden = await request('ward_infra_stats','anon',{headers:{'Accept-Profile':'kaun_private'}})
    assert.equal(hidden.status, 406)
    const denial = await request('rpc/refresh_ward_infra_stats','anon',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})
    assert.equal(denial.status, 401)
    const authDenial = await request('rpc/refresh_ward_infra_stats','authenticated',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})
    assert.equal(authDenial.status, 403)
    const writeDenial = await request('ward_infra_stats?ward_no=eq.1','anon',{method:'PATCH',headers:{'Content-Type':'application/json'},body:'{"daily_trips":999}'})
    assert.equal(writeDenial.status, 500)
    assert.equal(writeDenial.body.code, '55000')
    assert.equal((await request('ward_infra_stats?ward_no=eq.1')).body[0].daily_trips, 12)
    assert.deepEqual((await request('ward_infra_stats?ward_no=eq.999')).body,[])
    pg(['-c','UPDATE public.bmtc_stops SET trips=30 WHERE id=1'])
    const refreshed = await request('rpc/refresh_ward_infra_stats','service_role',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})
    assert.equal(refreshed.status, 204)
    assert.deepEqual((await request('ward_bus_stops?ward_no=eq.1')).body,[{ward_no:1,stop_count:1,total_trips:30}])
    assert.equal((await request('ward_infra_stats?ward_no=eq.1')).body[0].daily_trips,30)
    pg(['--single-transaction', '-f', resolve('supabase/rollbacks/20261117_private_ward_infra.sql')])
    await until(async () => (await request(path)).status === 200)
    for (const role of ['anon','authenticated','service_role']) {
      assert.equal((await request('ward_infra_stats?ward_no=eq.1',role)).body[0].daily_trips,30)
      assert.deepEqual((await request('ward_bus_stops?ward_no=eq.1',role)).body,[{ward_no:1,stop_count:1,total_trips:30}])
    }
    assert.equal((await request('rpc/refresh_ward_infra_stats','anon',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401)
    assert.equal(pg(['-c', "SELECT to_regnamespace('kaun_private') IS NULL, (SELECT relkind FROM pg_class WHERE oid='public.ward_infra_stats'::regclass)"]),'t|m')
    pg(['-c','UPDATE public.bmtc_stops SET trips=45 WHERE id=1'])
    assert.equal((await request('rpc/refresh_ward_infra_stats','service_role',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,204)
    assert.equal((await request('ward_bus_stops?ward_no=eq.1')).body[0].total_trips,45)
    t.diagnostic(`before/after roles: 200; single bus: 200; private schema: ${hidden.status}; anon/auth refresh: ${denial.status}/${authDenial.status}; anon PATCH: ${writeDenial.status}; service refresh: ${refreshed.status}; trips: 12 -> 30 -> rollback -> 45`)
  } finally {
    if (server && server.exitCode === null && server.signalCode === null) { const exited = new Promise(ok => server.once('exit', ok)); server.kill('SIGKILL'); await exited }
    if (started) execFileSync('pg_ctl', ['-D', db, '-m', 'immediate', 'stop'], { stdio: 'ignore' })
    rmSync(dir, { recursive: true, force: true })
  }
})
