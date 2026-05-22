// netlify/functions/generate-description.js
// Opción A: Gemini (si GEMINI_API_KEY está configurada en Netlify)
// Opción B: Pollinations.ai / Mistral — gratis, sin API key, siempre disponible

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { prompt } = JSON.parse(event.body);
    if (!prompt) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No se recibió ningún prompt.' }) };
    }

    let text = null;

    // --- Opción A: Gemini (alta calidad, requiere GEMINI_API_KEY en Netlify env vars) ---
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (geminiApiKey) {
      try {
        const { GoogleGenerativeAI } = require("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
        const result = await model.generateContent(prompt);
        text = result.response.text();
      } catch (geminiError) {
        // Gemini falló — continúa al fallback
        console.log("Gemini no disponible, usando Pollinations:", geminiError.message);
      }
    }

    // --- Opción B: Pollinations.ai — gratis, sin auth, sin configuración ---
    if (!text) {
      const pollinationsRes = await fetch('https://text.pollinations.ai/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          model: 'mistral',
          private: true
        })
      });

      if (!pollinationsRes.ok) {
        throw new Error(`Error generando descripción (${pollinationsRes.status}). Intentá de nuevo en unos segundos.`);
      }

      text = await pollinationsRes.text();
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
