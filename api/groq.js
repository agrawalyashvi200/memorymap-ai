export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Groq API key is not configured on the server. Please add GROQ_API_KEY in Vercel settings.' });
  }

  try {
    const { messages, model, response_format } = req.body;

    async function sendGroqReq(modelId) {
      const payload = { model: modelId, messages };
      if (response_format) payload.response_format = response_format;

      return await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });
    }

    const requestedModel = model || 'llama-3.2-11b-vision-preview';
    let response = await sendGroqReq(requestedModel);

    if (!response.ok) {
      const errText = await response.text();
      const isModelError = errText.includes('decommissioned') || errText.includes('does not exist') || response.status === 400 || response.status === 404;

      if (isModelError) {
        try {
          const modelsRes = await fetch('https://api.groq.com/openai/v1/models', {
            headers: { 'Authorization': `Bearer ${apiKey}` }
          });
          if (modelsRes.ok) {
            const modelsData = await modelsRes.json();
            const activeModelIds = (modelsData.data || []).map(m => m.id);

            // Filter candidates that might support vision or image inputs
            const candidateVisionModels = activeModelIds.filter(id =>
              id.includes('vision') || id.includes('qwen') || id.includes('llama-4') || id.includes('maverick') || id.includes('scout')
            );

            for (const candidate of candidateVisionModels) {
              const candidateRes = await sendGroqReq(candidate);
              if (candidateRes.ok) {
                const data = await candidateRes.json();
                return res.status(200).json(data);
              }
            }

            return res.status(400).json({
              error: {
                message: `Model '${requestedModel}' is unavailable. Active Groq models: ${activeModelIds.join(', ')}`
              }
            });
          }
        } catch (fallbackErr) {
          // Ignore fallback error and return original errText
        }
      }
      return res.status(response.status).send(errText);
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
