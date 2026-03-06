const https = require('https');

exports.handler = async function(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  try {
    const body = JSON.parse(event.body);

    // Convert Anthropic message format to Gemini format
    const systemPrompt = body.system || '';
    const messages = body.messages || [];

    // Build Gemini contents array
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const geminiPayload = JSON.stringify({
      system_instruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
      contents: contents,
      generationConfig: {
        maxOutputTokens: body.max_tokens || 1000,
        temperature: 0.7
      }
    });

    const apiKey = process.env.GEMINI_API_KEY;
    const model = 'gemini-1.5-flash-latest';

    const data = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(geminiPayload)
        }
      };

      const req = https.request(options, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(raw)); }
          catch(e) { reject(new Error('Failed to parse Gemini response')); }
        });
      });

      req.on('error', reject);
      req.write(geminiPayload);
      req.end();
    });

    if (data.error) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: data.error.message })
      };
    }

    // Convert Gemini response back to Anthropic-compatible format
    // so the HTML files don't need any changes
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const converted = {
      content: [{ type: 'text', text }]
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(converted)
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
