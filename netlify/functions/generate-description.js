// Archivo a actualizar: netlify/functions/generate-description.js

const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!geminiApiKey) {
      throw new Error("La API Key de Gemini no está configurada en el servidor.");
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    // --- CORRECCIÓN CLAVE: Usamos un modelo más moderno y específico ---
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

    const { prompt } = JSON.parse(event.body);
    if (!prompt) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No se recibió ningún prompt.' }) };
    }

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return {
      statusCode: 200,
      body: JSON.stringify({ text: text })
    };

  } catch (error) {
    console.error("Error en la función de Gemini:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
