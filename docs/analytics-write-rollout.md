# Analytics write rollout

Deploy the service-only /api/track first and verify a uniquely named diagnostic event is persisted. Then remove the anonymous INSERT grant and policy. Verify another event persists and anonymous direct inserts are rejected. The route returns a failure status on configuration or insert errors while the UI remains non-blocking.

To roll back the database restriction, run `supabase/rollbacks/20261116090000_restore_analytics_inserts.sql` first. Then, if needed, roll back the app. This restores public direct inserts and the prior exposure. Check the resulting policy and grants. The rollback does not remove analytics rows.

The public tracking endpoint can still receive fabricated events. Client-supplied analytics are not authenticated; this change only removes direct Data API insertion.
