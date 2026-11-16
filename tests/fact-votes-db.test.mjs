import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const hasPostgres = ['initdb', 'pg_ctl', 'psql'].every(cmd => {
  try { execFileSync('which', [cmd], { stdio: 'ignore' }); return true } catch { return false }
})

test('unique fact votes are counted once for current and legacy clients', { skip: !hasPostgres }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kaun-vote-test-'))
  const db = join(dir, 'db')
  const pg = (args) => execFileSync('psql', ['-X', '-h', dir, '-p', '55440', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt', ...args], { encoding: 'utf8' }).trim()
  let started = false
  try {
    execFileSync('initdb', ['-D', db, '-A', 'trust', '-U', 'postgres'], { stdio: 'ignore' })
    execFileSync('pg_ctl', ['-D', db, '-o', `-k ${dir} -p 55440 -h ''`, '-l', join(dir, 'log'), 'start'], { stdio: 'ignore' })
    started = true
    pg(['-c', `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE community_facts (id integer PRIMARY KEY, ward_no integer DEFAULT 1, contributor_token text, corroboration_count integer NOT NULL DEFAULT 0, dispute_count integer NOT NULL DEFAULT 0, created_at timestamp DEFAULT now());
      CREATE TABLE fact_votes (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, fact_id integer NOT NULL REFERENCES community_facts, vote_type varchar(16) NOT NULL, voter_token varchar(128) NOT NULL, created_at timestamp DEFAULT now(), UNIQUE(fact_id,voter_token));
      GRANT SELECT, INSERT ON community_facts TO anon; GRANT SELECT, INSERT ON fact_votes TO anon; GRANT USAGE, SELECT ON SEQUENCE fact_votes_id_seq TO anon;
      ALTER TABLE community_facts ENABLE ROW LEVEL SECURITY; CREATE POLICY read_facts ON community_facts FOR SELECT USING (true); CREATE POLICY insert_facts ON community_facts FOR INSERT TO anon WITH CHECK (true); ALTER TABLE fact_votes ENABLE ROW LEVEL SECURITY; CREATE POLICY read_votes ON fact_votes FOR SELECT USING (true); CREATE POLICY insert_votes ON fact_votes FOR INSERT TO anon WITH CHECK ((SELECT count(*) FROM fact_votes f WHERE f.voter_token = f.voter_token AND f.created_at > now() - interval '1 hour') < 20);
      CREATE FUNCTION increment_fact_counter(p_fact_id integer, p_column text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN IF p_column = 'corroboration_count' THEN UPDATE community_facts SET corroboration_count = corroboration_count + 1 WHERE id = p_fact_id; ELSIF p_column = 'dispute_count' THEN UPDATE community_facts SET dispute_count = dispute_count + 1 WHERE id = p_fact_id; END IF; END $$;`])
    const migration = resolve('supabase/migrations/20261116_safe_fact_votes.sql')
    // A legacy fact committed before its creator vote: the cutover must abort,
    // leaving the old schema and fact intact until the client finishes.
    pg(['-c', "SET ROLE anon; INSERT INTO community_facts(id,contributor_token,corroboration_count) VALUES (50,'before-migration',1)"])
    assert.throws(() => pg(['-f', migration]), /Unsafe vote cutover/)
    assert.equal(pg(['-c', "SELECT to_regprocedure('public.cast_fact_vote(integer,text,text)') IS NULL"]), 't')
    pg(['-c', "SET ROLE anon; INSERT INTO fact_votes(fact_id,vote_type,voter_token) VALUES (50,'corroborate','before-migration')"])
    assert.equal(pg(['-c', "SELECT corroboration_count,(SELECT count(*) FROM fact_votes WHERE fact_id=50) FROM community_facts WHERE id=50"]), '1|1')
    // A legacy vote committed before its separate increment: abort, then the
    // original RPC still increments exactly once after the failed cutover.
    pg(['-c', "SET ROLE anon; INSERT INTO fact_votes(fact_id,vote_type,voter_token) VALUES (50,'corroborate','pending-voter')"])
    assert.throws(() => pg(['-f', migration]), /Unsafe vote cutover/)
    pg(['-c', "SET ROLE anon; SELECT increment_fact_counter(50,'corroboration_count')"])
    assert.equal(pg(['-c', "SELECT corroboration_count,(SELECT count(*) FROM fact_votes WHERE fact_id=50) FROM community_facts WHERE id=50"]), '2|2')
    // Cleanup is confined to this disposable local PostgreSQL cluster.
    pg(['-c', 'TRUNCATE fact_votes, community_facts'])
    // A transaction holding an uncommitted insert makes the migration wait;
    // once it commits, the guard sees the row and aborts without changes.
    const holding = spawn('psql', ['-X', '-h', dir, '-p', '55440', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', "BEGIN; INSERT INTO community_facts(id,contributor_token,corroboration_count) VALUES (60,'in-flight',1); SELECT pg_sleep(2); COMMIT"], { stdio: 'ignore' })
    const held = new Promise((resolvePromise, reject) => { holding.on('error', reject); holding.on('exit', code => code === 0 ? resolvePromise() : reject(new Error(`psql exited ${code}`))) })
    let active = false
    for (let i = 0; i < 50 && !active; i++) {
      active = pg(['-c', "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND state='active' AND query LIKE '%pg_sleep(2)%')"]) === 't'
      if (!active) await new Promise(resolvePromise => setTimeout(resolvePromise, 20))
    }
    assert.equal(active, true, 'legacy transaction started')
    assert.throws(() => pg(['-f', migration]), /Unsafe vote cutover/)
    await held
    assert.equal(pg(['-c', "SELECT corroboration_count FROM community_facts WHERE id=60"]), '1')
    assert.equal(pg(['-c', "SELECT to_regprocedure('public.cast_fact_vote(integer,text,text)') IS NULL"]), 't')
    pg(['-c', 'TRUNCATE fact_votes, community_facts'])
    // New code requires the migration first; old code can still run afterwards.
    assert.throws(() => pg(['-c', "SET ROLE anon; SELECT cast_fact_vote(1,'corroborate','pre-migration')"]), /does not exist/)
    // Hold the migration after its empty check. An old fact INSERT arriving
    // while the locks are held must use the newly installed triggers on release.
    const slowMigration = join(dir, 'slow-migration.sql')
    const sql = readFileSync(migration, 'utf8')
    const marker = "END;\n$$;\n\n-- Count only"
    assert.ok(sql.includes(marker))
    writeFileSync(slowMigration, sql.replace(marker, () => "END;\n$$;\nSELECT pg_sleep(3);\n\n-- Count only"))
    const installing = spawn('psql', ['-X', '-h', dir, '-p', '55440', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt', '-f', slowMigration], { stdio: ['ignore', 'ignore', 'pipe'] })
    let migrationError = ''
    installing.stderr.on('data', data => { migrationError += data })
    const installed = new Promise((resolvePromise, reject) => { installing.on('error', reject); installing.on('exit', code => code === 0 ? resolvePromise() : reject(new Error(`migration exited ${code}: ${migrationError}`))) })
    let locked = false
    for (let i = 0; i < 50 && !locked; i++) {
      locked = pg(['-c', "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND state='active' AND query LIKE '%pg_sleep(3)%')"]) === 't'
      if (!locked) await new Promise(resolvePromise => setTimeout(resolvePromise, 20))
    }
    assert.equal(locked, true, 'migration holds cutover locks')
    assert.equal(pg(['-c', "SET ROLE anon; INSERT INTO community_facts(id,contributor_token,corroboration_count) VALUES (70,'across-cutover',1) RETURNING corroboration_count"]), '1')
    await installed
    assert.throws(() => pg(['-c', "SET ROLE anon; INSERT INTO fact_votes(fact_id,vote_type,voter_token) VALUES (70,'corroborate','across-cutover')"]), /duplicate key/)
    pg(['-c', "SET ROLE anon; INSERT INTO fact_votes(fact_id,vote_type,voter_token) VALUES (70,'corroborate','legacy-after'); SELECT increment_fact_counter(70,'corroboration_count')"])
    assert.equal(pg(['-c', "SELECT corroboration_count,(SELECT count(*) FROM fact_votes WHERE fact_id=70) FROM community_facts WHERE id=70"]), '2|2')
    assert.equal(pg(['-c', `SET ROLE anon;
      INSERT INTO community_facts(id,contributor_token,corroboration_count,dispute_count) VALUES (1,'creator',999,999)
      RETURNING corroboration_count,dispute_count`]), '1|0')
    pg(['-c', `SET ROLE anon;
      INSERT INTO community_facts(id,contributor_token,corroboration_count,dispute_count) VALUES (2,NULL,999,999);
      SELECT increment_fact_counter(1,'corroboration_count');
      INSERT INTO fact_votes(fact_id,vote_type,voter_token) VALUES (2,'corroborate','legacy');
      SELECT increment_fact_counter(2,'corroboration_count');
      SELECT cast_fact_vote(1,'corroborate','voter'); SELECT cast_fact_vote(1,'dispute','voter'); SELECT cast_fact_vote(1,'dispute','other');`])
    assert.equal(pg(['-c', 'SELECT corroboration_count,dispute_count,(SELECT count(*) FROM fact_votes WHERE fact_id=1) FROM community_facts WHERE id=1']), '2|1|3')
    assert.throws(() => pg(['-c', "SET ROLE anon; SELECT cast_fact_vote(1,'invalid','bad')"]), /Invalid vote/)
    // Simulate an old fact whose contributor vote was never recorded: the token
    // must not cause a later successful insert to be silently ignored.
    pg(['-c', "ALTER TABLE community_facts DISABLE TRIGGER USER; INSERT INTO community_facts(id,contributor_token) VALUES (3,'spoofed'); ALTER TABLE community_facts ENABLE TRIGGER USER; SET ROLE anon; SELECT cast_fact_vote(3,'corroborate','spoofed')"])
    assert.equal(pg(['-c', 'SELECT corroboration_count FROM community_facts WHERE id=3']), '1')
    // A creator vote error must roll back the fact as well as its count.
    pg(['-c', `CREATE FUNCTION reject_seed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.voter_token = 'fail' THEN RAISE EXCEPTION 'seed failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_seed BEFORE INSERT ON fact_votes FOR EACH ROW EXECUTE FUNCTION reject_seed()`])
    assert.throws(() => pg(['-c', "SET ROLE anon; INSERT INTO community_facts(id,contributor_token) VALUES (4,'fail')"]), /seed failure/)
    assert.equal(pg(['-c', 'SELECT count(*) FROM community_facts WHERE id=4']), '0')
    pg(['-c', "BEGIN; SET ROLE anon; INSERT INTO community_facts(id,contributor_token) VALUES (6,'rollback'); ROLLBACK"])
    assert.equal(pg(['-c', "SELECT (SELECT count(*) FROM community_facts WHERE id=6),(SELECT count(*) FROM fact_votes WHERE fact_id=6)"]), '0|0')
    pg(['-c', "BEGIN; SET ROLE anon; SELECT cast_fact_vote(1,'corroborate','rollback-vote'); ROLLBACK"])
    assert.equal(pg(['-c', "SELECT corroboration_count,(SELECT count(*) FROM fact_votes WHERE fact_id=1 AND voter_token='rollback-vote') FROM community_facts WHERE id=1"]), '2|0')
    assert.throws(() => pg(['-c', "SET ROLE anon; INSERT INTO fact_votes(fact_id,vote_type,voter_token) VALUES (1,'corroborate','creator')"]), /duplicate key/)
    assert.equal(pg(['-c', 'SELECT corroboration_count FROM community_facts WHERE id=1']), '2')

    const parallel = Array.from({ length: 16 }, (_, i) => new Promise((resolvePromise, reject) => {
      const token = i < 8 ? 'same' : `voter-${i}`
      const child = spawn('psql', ['-X', '-h', dir, '-p', '55440', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', `SET ROLE anon; SELECT cast_fact_vote(2,'corroborate','${token}')`], { stdio: 'ignore' })
      child.on('error', reject); child.on('exit', code => code === 0 ? resolvePromise() : reject(new Error(`psql exited ${code}`)))
    }))
    await Promise.all(parallel)
    assert.equal(pg(['-c', 'SELECT corroboration_count,(SELECT count(*) FROM fact_votes WHERE fact_id=2) FROM community_facts WHERE id=2']), '10|10')
    // Simulate an app rollback with old and new clients both still active.
    // The bridge changes no vote rows or counters, including votes added since migration.
    const snapshot = pg(['-c', "SELECT (SELECT md5(jsonb_agg(to_jsonb(v) ORDER BY id)::text) FROM fact_votes v),(SELECT md5(jsonb_agg(to_jsonb(f) ORDER BY id)::text) FROM community_facts f)"])
    pg(['-c', 'ALTER TABLE fact_votes DISABLE TRIGGER count_inserted_fact_vote'])
    assert.throws(() => pg(['-f', resolve('supabase/rollbacks/20261116_fact_votes_app_rollback_bridge.sql')]), /compatibility bridge missing/)
    pg(['-c', 'ALTER TABLE fact_votes ENABLE TRIGGER count_inserted_fact_vote'])
    pg(['-f', resolve('supabase/rollbacks/20261116_fact_votes_app_rollback_bridge.sql')])
    assert.equal(pg(['-c', "SELECT (SELECT md5(jsonb_agg(to_jsonb(v) ORDER BY id)::text) FROM fact_votes v),(SELECT md5(jsonb_agg(to_jsonb(f) ORDER BY id)::text) FROM community_facts f)"]), snapshot)
    pg(['-c', "SET ROLE anon; INSERT INTO fact_votes(fact_id,vote_type,voter_token) VALUES (2,'corroborate','legacy-after-rollback'); SELECT increment_fact_counter(2,'corroboration_count')"])
    assert.equal(pg(['-c', 'SELECT corroboration_count FROM community_facts WHERE id=2']), '11')
    const postRollback = JSON.parse(pg(['-c', "SET ROLE anon; SELECT cast_fact_vote(2,'corroborate','new-after-rollback')"]))
    assert.equal(postRollback.already_voted, false)
    assert.equal(postRollback.corroboration_count, 12)
    assert.equal(JSON.parse(pg(['-c', "SET ROLE anon; SELECT cast_fact_vote(2,'corroborate','new-after-rollback')"])).already_voted, true)
    assert.equal(pg(['-c', "SET ROLE anon; INSERT INTO community_facts(id,contributor_token,corroboration_count) VALUES (51,'legacy-creator',1) RETURNING corroboration_count"]), '1')
    assert.throws(() => pg(['-c', "SET ROLE anon; INSERT INTO fact_votes(fact_id,vote_type,voter_token) VALUES (51,'corroborate','legacy-creator')"]), /duplicate key/)
    assert.equal(pg(['-c', "SELECT corroboration_count,(SELECT count(*) FROM fact_votes WHERE fact_id=51) FROM community_facts WHERE id=51"]), '1|1')
    assert.equal(pg(['-c', "SET ROLE anon; INSERT INTO community_facts(id,contributor_token,corroboration_count) VALUES (52,'new-creator',1) RETURNING corroboration_count"]), '1')
    assert.equal(pg(['-c', "SELECT corroboration_count,(SELECT count(*) FROM fact_votes WHERE fact_id=52) FROM community_facts WHERE id=52"]), '1|1')
    // Exercise the migrated policy itself, not a test-only replacement. The
    // same token reaches 20 across distinct facts; another token remains free.
    pg(['-c', 'INSERT INTO community_facts(id) SELECT n FROM generate_series(100,125) n'])
    for (let n = 100; n < 119; n++) {
      pg(['-c', `SET ROLE anon; INSERT INTO fact_votes(fact_id,vote_type,voter_token) VALUES (${n},'corroborate','limited-token')`])
    }
    const twentieth = JSON.parse(pg(['-c', "SET ROLE anon; SELECT cast_fact_vote(119,'corroborate','limited-token')"]))
    assert.equal(twentieth.already_voted, false)
    const retry = JSON.parse(pg(['-c', "SET ROLE anon; SELECT cast_fact_vote(119,'dispute','limited-token')"]))
    assert.equal(retry.already_voted, true)
    assert.equal(retry.corroboration_count, twentieth.corroboration_count)
    assert.equal(retry.dispute_count, twentieth.dispute_count)
    assert.throws(() => pg(['-c', "SET ROLE anon; SELECT cast_fact_vote(120,'corroborate','limited-token')"]), /row-level security/)
    assert.throws(() => pg(['-c', "SET ROLE anon; INSERT INTO fact_votes(fact_id,vote_type,voter_token) VALUES (120,'corroborate','limited-token')"]), /row-level security/)
    pg(['-c', "SET ROLE anon; INSERT INTO fact_votes(fact_id,vote_type,voter_token) VALUES (120,'corroborate','other-token')"])
    assert.equal(pg(['-c', "SELECT count(*) FROM fact_votes WHERE voter_token='limited-token'"]), '20')
    assert.equal(pg(['-c', "SELECT count(*) FROM fact_votes WHERE voter_token='other-token'"]), '1')
    // Old votes do not count towards the current hour.
    pg(['-c', "INSERT INTO fact_votes(fact_id,vote_type,voter_token,created_at) SELECT n,'corroborate','old-token',now() - interval '2 hours' FROM generate_series(100,119) n"])
    pg(['-c', "SET ROLE anon; INSERT INTO fact_votes(fact_id,vote_type,voter_token) VALUES (120,'corroborate','old-token')"])
    // Creator vote bypasses votes RLS, while fact insertion still obeys its own policy.
    pg(['-c', `DROP POLICY insert_facts ON community_facts;
      CREATE POLICY insert_facts ON community_facts FOR INSERT TO anon WITH CHECK ((SELECT count(*) FROM community_facts f WHERE f.ward_no = f.ward_no AND f.created_at > now() - interval '1 hour') < 10);
      UPDATE community_facts SET created_at = now() - interval '2 hours';`])
    assert.equal(pg(['-c', "SET ROLE anon; INSERT INTO community_facts(id,contributor_token,corroboration_count) VALUES (5,'limited-token',999) RETURNING corroboration_count"]), '1')
    assert.equal(pg(['-c', "SELECT count(*) FROM fact_votes WHERE fact_id=5 AND voter_token='limited-token'"]), '1')
    pg(['-c', 'INSERT INTO community_facts(id) SELECT n FROM generate_series(10,20) n'])
    assert.throws(() => pg(['-c', "SET ROLE anon; INSERT INTO community_facts(id) VALUES (21)"]), /row-level security/)

  } finally {
    if (started) execFileSync('pg_ctl', ['-D', db, '-m', 'fast', 'stop'], { stdio: 'ignore' })
    rmSync(dir, { recursive: true, force: true })
  }
})
