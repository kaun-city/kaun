#!/usr/bin/env node
/**
 * multi-llm-research.mjs — Query multiple LLMs via OpenRouter for civic research.
 *
 * Uses OpenRouter to hit GPT-4o, Gemini, Llama, Mistral, etc. in parallel,
 * each with the same research prompt. Aggregates unique findings.
 *
 * Usage: node scripts/multi-llm-research.mjs "your research question"
 * Env:   OPENROUTER_API_KEY
 */

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY
if (!OPENROUTER_KEY) {
  console.error("OPENROUTER_API_KEY not set")
  process.exit(1)
}

const MODELS = [
  "openai/gpt-4o",
  "google/gemini-2.5-flash-preview",
  "meta-llama/llama-4-maverick",
  "mistralai/mistral-large-2",
  "deepseek/deepseek-chat-v3-0324",
]

const PROMPT = process.argv.slice(2).join(" ") || `You are a civic accountability researcher focused on Bengaluru, India.

Research and list the most alarming, specific, verifiable civic governance facts about Bengaluru (BBMP/GBA) that citizens should know. Focus on:

1. Specific contractor scams, irregularities, or corruption cases with names and amounts
2. MLA/corporator misconduct with specific names and constituencies
3. Infrastructure failures with specific data (roads, water, sewage, lakes)
4. Budget misallocation or missing funds with specific amounts
5. Environmental violations (lake encroachment, sewage dumping, tree felling) with locations
6. Public health failures with specific data
7. Comparison with other Indian cities showing where Bengaluru ranks worst
8. Any ongoing investigations (ED, CBI, Lokayukta) with specific cases

For each fact: name the specific people/entities involved, cite the amount of money, give the time period, and name your source (newspaper, RTI, court order, government report).

Be specific. No vague claims. Only facts that can be verified.`

async function queryModel(model) {
  const start = Date.now()
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://kaun.city",
        "X-Title": "Kaun Civic Research",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: PROMPT }],
        max_tokens: 4096,
        temperature: 0.3,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`HTTP ${res.status}: ${err.slice(0, 200)}`)
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content || ""
    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    console.log(`\n✓ ${model} (${elapsed}s, ${content.length} chars)`)
    return { model, content, error: null }
  } catch (e) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    console.log(`\n✗ ${model} (${elapsed}s): ${e.message}`)
    return { model, content: null, error: e.message }
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════")
  console.log("MULTI-LLM CIVIC RESEARCH — BENGALURU")
  console.log(`Models: ${MODELS.length}`)
  console.log(`Prompt: ${PROMPT.slice(0, 100)}...`)
  console.log("═══════════════════════════════════════════════")

  const results = await Promise.all(MODELS.map(queryModel))

  console.log("\n\n═══════════════════════════════════════════════")
  console.log("RESULTS")
  console.log("═══════════════════════════════════════════════")

  for (const r of results) {
    console.log(`\n${"─".repeat(60)}`)
    console.log(`MODEL: ${r.model}`)
    console.log(`${"─".repeat(60)}`)
    if (r.error) {
      console.log(`ERROR: ${r.error}`)
    } else {
      console.log(r.content)
    }
  }

  // Summary
  const successful = results.filter(r => r.content)
  console.log(`\n\n═══════════════════════════════════════════════`)
  console.log(`SUMMARY: ${successful.length}/${MODELS.length} models responded`)
  console.log("═══════════════════════════════════════════════")
}

main().catch(e => { console.error("Fatal:", e); process.exit(1) })
