import assert from 'node:assert/strict'
import { test } from 'node:test'
import { handler } from '../netlify/functions/ai-chat.js'

test('exports a loadable ES-module handler with preflight and method handling', async () => {
  assert.equal(typeof handler, 'function')
  const preflight = await handler({ headers: {}, httpMethod: 'OPTIONS' })
  assert.equal(preflight.statusCode, 204)
  assert.equal(preflight.headers['Access-Control-Allow-Headers'], 'Content-Type')

  const response = await handler({ headers: {}, httpMethod: 'GET' })
  assert.equal(response.statusCode, 405)
  assert.deepEqual(JSON.parse(response.body), { error: 'Method not allowed' })
})

test('preserves POST validation and chat response without network requests', async (t) => {
  const originalKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = 'test-placeholder'
  t.after(() => {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = originalKey
  })
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/chat/completions')
    assert.equal(options.method, 'POST')
    const request = JSON.parse(options.body)
    assert.equal(request.messages[1].content, 'Test message')
    assert.ok(request.messages[0].content.includes('Test context'))
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Test reply' } }] })
    }
  })

  const event = { headers: {}, httpMethod: 'POST' }
  const invalid = await handler({ ...event, body: '{' })
  assert.equal(invalid.statusCode, 400)
  assert.deepEqual(JSON.parse(invalid.body), { error: 'Invalid JSON' })
  const missing = await handler({ ...event, body: '{}' })
  assert.equal(missing.statusCode, 400)
  assert.deepEqual(JSON.parse(missing.body), { error: 'Missing message' })
  const oversized = await handler({ ...event, body: 'x'.repeat(8001) })
  assert.equal(oversized.statusCode, 413)
  assert.equal(fetchMock.mock.callCount(), 0)

  const response = await handler({
    ...event,
    body: JSON.stringify({ message: 'Test message', context: 'Test context' })
  })
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(response.body), { reply: 'Test reply' })
  assert.equal(fetchMock.mock.callCount(), 1)
})
