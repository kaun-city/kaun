// Each management API query has its own transaction. Keep public first so
// unqualified application objects are created there, whichever schema owns PostGIS.
export function spatialSql(sql) {
  return `SET LOCAL search_path = public, extensions, pg_temp;\n${sql}`
}
