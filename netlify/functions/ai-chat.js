// Netlify serverless function: AI chat endpoint
// Called by AiChat.jsx component
// Requires OPENAI_API_KEY environment variable set in Netlify dashboard

exports.handler = async (event) => {
  // ── CORS: only allow requests from the deployed site or local dev ──────────
  const origin = event.headers.origin || event.headers.referer || ''
  const siteUrl = process.env.URL || ''   // Netlify automatically sets this to the site's primary URL

  const isAllowedOrigin =
    origin === '' ||                        // direct server calls (no origin header)
    origin.includes('localhost') ||
    origin.includes('127.0.0.1') ||
    (siteUrl && origin.startsWith(siteUrl)) ||
    origin.includes('.netlify.app')         // any netlify.app subdomain (covers previews)

  const corsHeaders = {
    'Access-Control-Allow-Origin': siteUrl || '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  }

  // Pre-flight OPTIONS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' }
  }

  if (!isAllowedOrigin) {
    return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'Forbidden' }) }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  // ── Block oversized payloads (bot abuse / accidental large requests) ───────
  const MAX_BODY = 8000  // 8KB — plenty for a chat message + context summary
  if (event.body && event.body.length > MAX_BODY) {
    return { statusCode: 413, headers: corsHeaders, body: JSON.stringify({ error: 'Payload too large' }) }
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        reply: "⚠️ AI chat needs an OpenAI API key.\n\nTo enable it:\n1. Go to Netlify dashboard → Site settings → Environment variables\n2. Add: OPENAI_API_KEY = your-openai-key\n3. Redeploy the site\n\nYou can get an API key at platform.openai.com\n\nFor now, the local fallback analysis above will answer basic questions."
      })
    }
  }

  let body
  try {
    body = JSON.parse(event.body)
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const { message, context } = body
  if (!message) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Missing message' }) }

  // ── Cap message + context size to control OpenAI token spend ──────────────
  const safeMessage = String(message).slice(0, 500)
  const safeContext = String(context || '').slice(0, 1500)

  const systemPrompt = `You are an expert lottery number analyst called "LottoLens AI". You have deep knowledge of these statistical methods:

1. LASER DIAGONAL METHOD: From each seed number in draw D(n), fire NE beams (row decreases by 1 per step) and SE beams (row increases by 1 per step). The row number equals the lottery number (1-45). Numbers the beam passes through on the way to D(n+1) are candidates.

2. CORNER TOUCH: Cells ±1 row from the exact diagonal path are "corner-grazed" by the laser beam edge. E.g., if NE beam from seed #15 at step 10 lands on row 5 (#5), it also corner-grazes #4 and #6.

3. TRANSITION MATRIX: Historical data of which numbers appeared in draw D(n+1) when a given number was in draw D(n). High rate means strong "sends" relationship.

4. RECENT WINDOW (W50): Same transition analysis but only last 50 draws — captures current hot streaks.

5. GAP SCORE: Numbers not seen for many draws are "overdue" and get a bonus.

You always have access to the full prediction context below. Be specific, cite numbers and scores. Keep responses concise (max 200 words) but insightful. Use emojis for clarity.

${safeContext}`

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: safeMessage }
        ],
        max_tokens: 300,
        temperature: 0.7
      })
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`OpenAI error: ${err}`)
    }

    const data = await response.json()
    const reply = data.choices?.[0]?.message?.content || 'No response from AI.'

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ reply })
    }
  } catch (err) {
    console.error('AI chat error:', err)
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        reply: `AI service error: ${err.message}\n\nFalling back to local analysis. Ask me about top picks, specific numbers, or gap analysis and I'll answer from the prediction data.`
      })
    }
  }
}


  let body
  try {
    body = JSON.parse(event.body)
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const { message, context } = body
  if (!message) return { statusCode: 400, body: JSON.stringify({ error: 'Missing message' }) }

  const systemPrompt = `You are an expert lottery number analyst called "LottoLens AI". You have deep knowledge of these statistical methods:

1. LASER DIAGONAL METHOD: From each seed number in draw D(n), fire NE beams (row decreases by 1 per step) and SE beams (row increases by 1 per step). The row number equals the lottery number (1-45). Numbers the beam passes through on the way to D(n+1) are candidates.

2. CORNER TOUCH: Cells ±1 row from the exact diagonal path are "corner-grazed" by the laser beam edge. E.g., if NE beam from seed #15 at step 10 lands on row 5 (#5), it also corner-grazes #4 and #6.

3. TRANSITION MATRIX: Historical data of which numbers appeared in draw D(n+1) when a given number was in draw D(n). High rate means strong "sends" relationship.

4. RECENT WINDOW (W50): Same transition analysis but only last 50 draws — captures current hot streaks.

5. GAP SCORE: Numbers not seen for many draws are "overdue" and get a bonus.

You always have access to the full prediction context below. Be specific, cite numbers and scores. Keep responses concise (max 200 words) but insightful. Use emojis for clarity.

${context || 'No prediction context provided.'}`

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        max_tokens: 300,
        temperature: 0.7
      })
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`OpenAI error: ${err}`)
    }

    const data = await response.json()
    const reply = data.choices?.[0]?.message?.content || 'No response from AI.'

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply })
    }
  } catch (err) {
    console.error('AI chat error:', err)
    return {
      statusCode: 200,
      body: JSON.stringify({
        reply: `AI service error: ${err.message}\n\nFalling back to local analysis. Ask me about top picks, specific numbers, or gap analysis and I'll answer from the prediction data.`
      })
    }
  }
}
