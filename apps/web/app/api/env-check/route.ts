export async function GET() {
  const s = process.env.CRON_SECRET ?? "NOT_SET"
  return Response.json({ len: s.length, trimLen: s.trim().length, first5: s.substring(0,5), last5: s.substring(s.length-5) })
}
