// Local one-time setup. Credentials stay in memory and are passed to the official
// Telegram API and Vercel CLI; they are never written to files or logs.
import http from "node:http"
import { randomBytes } from "node:crypto"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const cwd = fileURLToPath(new URL("../apps/web/", import.meta.url))
const nonce = randomBytes(24).toString("hex")
let origin, signingIn = false, connected = false, loginUrl = "", busy = false
function cli(args, input, onOutput) {
  return new Promise(resolve => {
    const child = spawn("npx", ["--yes", "vercel@62.1.0", ...args], {
      cwd, shell: process.platform === "win32", windowsHide: true,
      env: { ...process.env, NO_UPDATE_NOTIFIER: "1" }, stdio: ["pipe", "pipe", "pipe"],
    })
    for (const stream of [child.stdout, child.stderr]) stream.on("data", bytes => onOutput?.(bytes.toString()))
    child.on("error", () => resolve(false))
    child.on("close", code => resolve(code === 0))
    child.stdin.end(input ?? "")
  })
}
const reply = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" })
  res.end(JSON.stringify(body))
}
const html = () => `<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect Kaun Alerts</title>
<style>body{font:17px system-ui;background:#f2ede4;color:#24221f;max-width:610px;margin:55px auto;padding:24px}h1{font-size:30px}button,input{font:inherit;padding:13px;border:1px solid #aaa;border-radius:6px}input{width:95%;margin:10px 0}button{background:#263c31;color:white;cursor:pointer}a{color:#24573b}#result{padding:16px 0;white-space:pre-wrap}.muted{color:#666;font-size:14px}</style>
<h1>Connect Kaun Alerts</h1><p>This is the one-time setup. Your token will be saved as a production Secret in the Kaun project on Vercel.</p>
<p><b>1.</b> <button id="login">Sign in to Vercel</button> <a id="verify" target="_blank" hidden>Finish sign-in</a><span id="auth"></span></p>
<p><b>2.</b> Open <a href="https://t.me/kaun_city_traffic_alerts_bot" target="_blank">Kaun Alerts</a> and send <b>/start</b> again.</p>
<p><b>3.</b> In <a href="https://t.me/BotFather" target="_blank">BotFather</a>, send <b>/mybots</b>, select <b>@kaun_city_traffic_alerts_bot</b>, then <b>API Token</b>. Copy that token below.</p>
<form id="form"><label for="token">Bot token</label><input id="token" type="password" autocomplete="off" required placeholder="Paste the BotFather token here"><button id="save">Connect Telegram and save to Vercel</button></form>
<p class="muted">The chat ID is found automatically. The token is never shown in this chat or saved to a local file. Page views are counts of page loads, without visitor IDs.</p><div id="result" role="status"></div>
<script>const nonce=${JSON.stringify(nonce)};const result=document.getElementById('result');
async function request(path,body){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Setup-Nonce':nonce},body:JSON.stringify(body||{})});return r.json()}
document.getElementById('login').onclick=async()=>{await request('/login');result.textContent='Preparing Vercel sign-in...'};
setInterval(async()=>{try{const s=await request('/status');document.getElementById('auth').textContent=s.connected?' Signed in ✓':'';const a=document.getElementById('verify');if(s.loginUrl){a.href=s.loginUrl;a.hidden=false}if(s.connected){a.hidden=true;document.getElementById('login').disabled=true}}catch{}},2000);
document.getElementById('form').onsubmit=async e=>{e.preventDefault();document.getElementById('save').disabled=true;result.textContent='Checking the bot, finding your chat ID, and saving secrets...';try{const token=document.getElementById('token').value;const r=await request('/connect',{token});result.textContent=r.message;if(r.ok)document.getElementById('token').value=''}catch{result.textContent='Connection interrupted. Please retry.'}finally{document.getElementById('save').disabled=false}};
</script></html>`
const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" })
    return res.end(html())
  }
  if (req.method !== "POST" || req.headers.origin !== origin || req.headers["x-setup-nonce"] !== nonce) return reply(res, 403, { message: "Forbidden" })
  if (req.url === "/status") return reply(res, 200, { connected, loginUrl })
  if (req.url === "/login") {
    if (!signingIn && !connected) {
      signingIn = true
      void cli(["login"], undefined, output => {
        const url = output.match(/https:\/\/vercel\.com\/[^\s\x1b]+/)
        if (url && url[0].includes("user_code=")) loginUrl = url[0]
      }).then(ok => { connected = ok; signingIn = false; if (ok) loginUrl = "" })
    }
    return reply(res, 200, { ok: true })
  }
  if (req.url !== "/connect" || busy) return reply(res, 409, { message: "Setup is busy. Please wait." })
  if (!connected) return reply(res, 400, { message: "Finish Vercel sign-in first, then click Connect." })
  let raw = ""
  for await (const chunk of req) { raw += chunk; if (raw.length > 2000) return reply(res, 413, { message: "Input is too long" }) }
  busy = true
  try {
    const { token: enteredToken } = JSON.parse(raw)
    const token = typeof enteredToken === "string" ? enteredToken.trim() : ""
    if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) return reply(res, 400, { message: "That does not look like a BotFather token. Copy the API Token again." })
    async function telegram(method, body = {}) {
      const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
      })
      const value = await response.json()
      if (!response.ok || !value.ok) throw new Error("Telegram could not verify the token. Copy it again from BotFather.")
      return value.result
    }
    const bot = await telegram("getMe")
    if (bot.username !== "kaun_city_traffic_alerts_bot") return reply(res, 400, { message: "This token belongs to a different bot. Select @kaun_city_traffic_alerts_bot in BotFather." })
    const updates = await telegram("getUpdates", { timeout: 0 })
    const chats = [...new Map(updates.filter(u => u.message?.chat.type === "private" && u.message.text === "/start")
      .map(u => [u.message.chat.id, u.message.chat])).values()]
    if (chats.length !== 1) return reply(res, 400, { message: chats.length ? "More than one private chat was found. Ask Codex to help select yours; no credentials are needed in chat." : "Send /start to Kaun Alerts now, then click Connect again." })
    const chatId = String(chats[0].id)
    for (const [key, value] of [["TELEGRAM_BOT_TOKEN", token], ["TELEGRAM_CHAT_ID", chatId]]) {
      const saved = await cli(["env", "add", key, "production", "--scope", "kaun", "--project", "kaun", "--sensitive", "--force", "--yes"], `${value}\n`)
      if (!saved) throw new Error(`Vercel could not save ${key}. Check that the signed-in account has access to Kaun, then retry.`)
    }
    await telegram("sendMessage", { chat_id: chatId, text: "✅ Kaun Alerts connected. Your Telegram settings have been saved to Vercel. Daily traffic updates and submission alerts start once the new production deployment is active.", disable_web_page_preview: true })
    return reply(res, 200, { ok: true, message: "Connected ✓ A test message has been sent to your Telegram. Both production secrets are saved. Tell Codex 'connected' so it can finish the production delivery check." })
  } catch (error) {
    // Only our own fixed messages are safe to show. Never echo fetch/CLI errors.
    const message = error.message.startsWith("Vercel could not") || error.message.startsWith("Telegram could not") ? error.message : "Connection failed. Check Vercel sign-in and the token, then retry."
    reply(res, 400, { message })
  } finally { raw = ""; busy = false }
})
server.listen(0, "127.0.0.1", () => {
  origin = `http://127.0.0.1:${server.address().port}`
  console.log(`Telegram setup page: ${origin}`)
  void cli(["whoami"]).then(ok => { connected = ok })
})
