// Archivo a actualizar: netlify/functions/calculate-rent.js

exports.handler = async function(event, context) {
  // Solo permitir peticiones POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { initialAmount, startDate, months } = JSON.parse(event.body);

    if (!initialAmount || !startDate || !months) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Faltan parámetros en la petición.' }) };
    }
    
    // La API espera el formato YYYY-MM-DD, así que agregamos el día 01
    const fullDate = `${startDate}-01`;

    const rapidApiKey = process.env.RAPIDAPI_KEY;
    if (!rapidApiKey) {
      throw new Error("La API Key de RapidAPI no está configurada en el servidor.");
    }

    const options = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-RapidAPI-Key': rapidApiKey,
        'X-RapidAPI-Host': 'arquilerapi1.p.rapidapi.com'
      },
      body: JSON.stringify({
        amount: initialAmount,
        date: fullDate,
        months: parseInt(months),
        rate: 'ipc'
      })
    };

    const apiResponse = await fetch('https://arquilerapi1.p.rapidapi.com/calculate', options);
    const data = await apiResponse.json();

    // --- CORRECCIÓN CLAVE: Si la API externa responde con cualquier cosa que no sea un éxito,
    // capturamos su mensaje de error y lo enviamos al frontend. ---
    if (!apiResponse.ok || data.error || !data.newAmount) {
      // El mensaje de error puede venir en el campo 'message', 'error', o ser otro.
      // Lo buscamos y lo pasamos.
      const errorMessage = data.message || data.error || "La API externa devolvió una respuesta inesperada.";
      throw new Error(errorMessage);
    }

    // Si todo va bien, devolvemos la respuesta exitosa.
    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };

  } catch (error) {
    console.error("Error en la función calculate-rent:", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
