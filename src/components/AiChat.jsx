import { useState, useRef, useEffect } from 'react'
import './AiChat.css'

const QUICK_PROMPTS = [
  "What are the top 5 numbers to pick?",
  "Explain why #35 is strong",
  "Which numbers have most laser beams?",
  "What's the gap analysis say?",
  "Give me a confident 5-number ticket",
  "Compare the top 3 picks",
]

export default function AiChat({ prediction, draws }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: `Hello! 👋 I'm your lottery AI analyst.\n\nI have full access to ${draws?.length || 0} draws and the D${prediction?.nextDrawNum || '?'} prediction data — laser beams, transitions, gaps, everything.\n\nAsk me anything about the next draw!`
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  const buildContext = () => {
    if (!prediction || !draws) return ''
    const { results, seeds, nextDrawNum, drawNum } = prediction
    const top15 = results.slice(0, 15)
    const recentDraws = draws.slice(-5).map((d, i) => `D${draws.length - 4 + i}: [${d.join(', ')}]`).join('\n')

    return `
LOTTERY PREDICTION CONTEXT:
Draw History: ${draws.length} total draws
Last draw D${drawNum}: [${seeds.join(', ')}]  (these are the seeds for prediction)
Predicting: D${nextDrawNum}

TOP 15 PREDICTED NUMBERS (by combined laser+transition+gap score):
${top15.map((r, i) =>
  `#${i+1}. Number ${r.number} (tier:${r.tier} score:${r.score}) — laser_direct:${r.laserDirect} corner:${r.laserCorner} trans:${r.transScore.toFixed(0)} w50:${r.w50Score.toFixed(0)} gap:${r.gap} freq:${r.freq}% — beam_from_seeds:[${r.directSeeds.join(',')}]`
).join('\n')}

RECENT 5 DRAWS:
${recentDraws}

SCORING METHOD:
- Laser beams: NE/SE diagonals fired from each seed (30% weight)
- Corner touches: adjacent cells the beam grazes (15% weight)
- All-time transition: how often seed→number transition occurred historically (25%)
- Recent W50 transition: same but last 50 draws only (20%)
- Gap score: how many draws since number last appeared (7%)
- Frequency: overall appearance rate (3%)

Seeds fire NE beam (row decreases) and SE beam (row increases) from their row position.
Corner-adjacent = cells ±1 row from exact beam path, like how #15's NE beam grazes #4 at step 10.
`.trim()
  }

  const sendMessage = async (text) => {
    const userMsg = text || input.trim()
    if (!userMsg) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: userMsg }])
    setLoading(true)

    try {
      const context = buildContext()
      const res = await fetch('/.netlify/functions/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, context })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setMessages(prev => [...prev, { role: 'assistant', text: data.reply }])
    } catch (err) {
      // Fallback: local analysis if Netlify function not available
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: buildLocalReply(userMsg, prediction)
      }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Floating button */}
      <button className={`aic-fab ${open ? 'aic-fab-open' : ''}`} onClick={() => setOpen(o => !o)}>
        {open ? '✕' : '🤖'}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="aic-panel">
          <div className="aic-header">
            <span className="aic-header-icon">🤖</span>
            <div>
              <div className="aic-header-title">AI Lottery Analyst</div>
              <div className="aic-header-sub">D{prediction?.nextDrawNum} · {draws?.length} draws loaded</div>
            </div>
            <button className="aic-close" onClick={() => setOpen(false)}>✕</button>
          </div>

          <div className="aic-messages">
            {messages.map((m, i) => (
              <div key={i} className={`aic-msg aic-msg-${m.role}`}>
                <div className="aic-msg-bubble">
                  {m.text.split('\n').map((line, j) => (
                    <span key={j}>{line}{j < m.text.split('\n').length - 1 && <br />}</span>
                  ))}
                </div>
              </div>
            ))}
            {loading && (
              <div className="aic-msg aic-msg-assistant">
                <div className="aic-msg-bubble aic-typing">
                  <span /><span /><span />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick prompts */}
          <div className="aic-quick">
            {QUICK_PROMPTS.map(q => (
              <button key={q} className="aic-quick-btn" onClick={() => sendMessage(q)}>
                {q}
              </button>
            ))}
          </div>

          <div className="aic-input-row">
            <input
              className="aic-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Ask about next draw…"
              disabled={loading}
            />
            <button className="aic-send" onClick={() => sendMessage()} disabled={loading || !input.trim()}>
              ➤
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// ── Local fallback analysis (no API key needed) ───────────────────────────────
function buildLocalReply(question, prediction) {
  if (!prediction) return "No prediction data available yet."
  const { results, seeds, nextDrawNum } = prediction
  const top5 = results.slice(0, 5)
  const q = question.toLowerCase()

  if (q.includes('top') || q.includes('ticket') || q.includes('pick') || q.includes('best')) {
    return `For D${nextDrawNum}, based on seeds [${seeds.join(', ')}], my top 5 picks are:\n\n${
      top5.map((r, i) => `${i+1}. #${r.number} (score: ${r.score}) — ${r.laserDirect} direct laser beams${r.laserCorner > 0 ? ` + ${r.laserCorner} corner touches` : ''}${r.gap >= 10 ? ` — overdue ${r.gap} draws` : ''}`).join('\n')
    }\n\nSuggested ticket: ${top5.map(r => r.number).join(' - ')}`
  }

  // Check if asking about a specific number
  const numMatch = question.match(/\#?(\d+)/)
  if (numMatch) {
    const n = parseInt(numMatch[1])
    const r = results.find(x => x.number === n)
    if (r) {
      const rank = results.indexOf(r) + 1
      return `Number #${n} is ranked #${rank} for D${nextDrawNum}.\n\nScore: ${r.score} (${r.tier} tier)\nLaser direct hits: ${r.laserDirect} (from seeds: ${r.directSeeds.join(', ')})\nCorner touches: ${r.laserCorner}\nTransition score: ${r.transScore.toFixed(0)}\nRecent W50 transition: ${r.w50Score.toFixed(0)}\nGap: ${r.gap} draws since last seen\nFrequency: ${r.freq}% of all draws\n\n${r.laserDirect >= 2 ? `✅ Very strong — ${r.laserDirect} independent laser beams hit it.` : r.laserDirect === 1 ? `⚡ 1 direct beam + ${r.laserCorner} corner grazes.` : `◈ Mainly corner-touch + transition support.`}`
    }
    return `#${n} is one of the seeds [${seeds.join(', ')}] and won't appear in next draw, or is out of range.`
  }

  if (q.includes('gap') || q.includes('overdue')) {
    const overdueNums = results.filter(r => r.gap >= 15).sort((a, b) => b.gap - a.gap).slice(0, 5)
    return `Most overdue numbers for D${nextDrawNum}:\n\n${overdueNums.map(r => `#${r.number} — ${r.gap} draws overdue (rank #${results.indexOf(r) + 1})`).join('\n')}`
  }

  if (q.includes('laser') || q.includes('beam')) {
    const topLaser = results.slice(0, 20).sort((a, b) => (b.laserDirect * 2 + b.laserCorner) - (a.laserDirect * 2 + a.laserCorner)).slice(0, 5)
    return `Top numbers by laser beam count for D${nextDrawNum}:\n\n${topLaser.map(r => `#${r.number} — ${r.laserDirect} direct + ${r.laserCorner} corner (total score: ${r.score})`).join('\n')}`
  }

  return `For D${nextDrawNum} prediction from seeds [${seeds.join(', ')}]:\n\n🔥 Strong: ${results.filter(r => r.tier === 'hot').map(r => r.number).join(', ')}\n⚡ Likely: ${results.filter(r => r.tier === 'warm').slice(0, 6).map(r => r.number).join(', ')}\n\nTop ticket: ${top5.map(r => r.number).join(' - ')}\n\nTip: Add an OpenAI API key to VITE_OPENAI_API_KEY for full AI chat responses.`
}
