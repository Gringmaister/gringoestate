// Archivo a actualizar: netlify/functions/calculate-rent.js

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { initialAmount, startDate, months } = JSON.parse(event.body);

    if (!initialAmount || !startDate || !months) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Faltan parámetros.' }) };
    }
    
    const fullDate = `${startDate}-01`;
    const rapidApiKey = process.env.RAPIDAPI_KEY;

    if (!rapidApiKey) {
      throw new Error("La API Key de RapidAPI no está configurada.");
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
        months: parseInt(months), // Aseguramos que sea un número
        rate: 'ipc'
      })
    };

    const apiResponse = await fetch('https://arquilerapi1.p.rapidapi.com/calculate', options);
    const data = await apiResponse.json();

    // --- CORRECCIÓN CLAVE: Mejor manejo de errores de la API externa ---
    if (!apiResponse.ok || data.error) {
      // Si la API externa devuelve un error, lo pasamos al frontend.
      throw new Error(data.message || data.error || 'Error en la API de cálculo.');
    }

    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };

  } catch (error) {
    console.error("Error en la función calculate-rent:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
