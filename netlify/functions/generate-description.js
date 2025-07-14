// Este es el código que se ejecuta de forma segura en los servidores de Netlify.
// No es visible para los usuarios.

exports.handler = async function(event, context) {
  // 1. Obtiene el texto que el usuario escribió en la web.
  const { prompt } = JSON.parse(event.body);

  // 2. Obtiene tu clave secreta de API de forma segura desde la configuración de Netlify.
  const apiKey = process.env.GEMINI_API_KEY;

  // Verifica que todo lo necesario esté presente.
  if (!prompt || !apiKey) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Faltan datos para la consulta.' })
    };
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  try {
    // 3. Tu servidor (Netlify) llama a la API de Google, incluyendo la clave secreta.
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      }),
    });

    const result = await response.json();

    if (!response.ok) {
        // Si Google devuelve un error, lo capturamos.
        throw new Error(result.error ? result.error.message : 'Error en la API de Gemini');
    }

    // 4. Tu servidor envía la respuesta exitosa de vuelta a tu página web.
    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };

  } catch (error) {
    // Si algo falla en nuestro asistente, también lo manejamos.
    console.error('Error en la función serverless:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
