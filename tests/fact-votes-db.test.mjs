import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
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
      CREATE TABLE community_facts (id integer PRIMARY KEY, contributor_token text, corroboration_count integer NOT NULL DEFAULT 0, dispute_count integer NOT NULL DEFAULT 0);
      CREATE TABLE fact_votes (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, fact_id integer NOT NULL REFERENCES community_facts, vote_type varchar(16) NOT NULL, voter_token varchar(128) NOT NULL, UNIQUE(fact_id,voter_token));
      GRANT SELECT ON community_facts, fact_votes TO anon; GRANT INSERT ON fact_votes TO anon; GRANT USAGE, SELECT ON SEQUENCE fact_votes_id_seq TO anon;
      ALTER TABLE fact_votes ENABLE ROW LEVEL SECURITY; CREATE POLICY read_votes ON fact_votes FOR SELECT USING (true); CREATE POLICY insert_votes ON fact_votes FOR INSERT TO anon WITH CHECK (true);`])
    pg(['-f', resolve('supabase/migrations/20261116_safe_fact_votes.sql')])
    pg(['-c', `INSERT INTO community_facts VALUES (1,'creator',1,0),(2,NULL,0,0);
      SET ROLE anon; INSERT INTO fact_votes(fact_id,vote_type,voter_token) VALUES (1,'corroborate','creator'),(2,'corroborate','legacy');
      SELECT increment_fact_counter(1,'corroboration_count'); SELECT increment_fact_counter(2,'corroboration_count');
      SELECT cast_fact_vote(1,'corroborate','voter'); SELECT cast_fact_vote(1,'dispute','voter'); SELECT cast_fact_vote(1,'dispute','other');`])
    assert.equal(pg(['-c', 'SELECT corroboration_count,dispute_count FROM community_facts WHERE id=1']), '2|1')
    assert.throws(() => pg(['-c', "SET ROLE anon; SELECT cast_fact_vote(1,'invalid','bad')"]), /Invalid vote/)
    const parallel = Array.from({ length: 16 }, (_, i) => new Promise((resolvePromise, reject) => {
      const token = i < 8 ? 'same' : `voter-${i}`
      const child = spawn('psql', ['-X', '-h', dir, '-p', '55440', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', `SET ROLE anon; SELECT cast_fact_vote(2,'corroborate','${token}')`], { stdio: 'ignore' })
      child.on('error', reject); child.on('exit', code => code === 0 ? resolvePromise() : reject(new Error(`psql exited ${code}`)))
    }))
    await Promise.all(parallel)
    assert.equal(pg(['-c', 'SELECT corroboration_count,(SELECT count(*) FROM fact_votes WHERE fact_id=2) FROM community_facts WHERE id=2']), '10|10')
  } finally {
    if (started) execFileSync('pg_ctl', ['-D', db, '-m', 'fast', 'stop'], { stdio: 'ignore' })
    rmSync(dir, { recursive: true, force: true })
  }
})
