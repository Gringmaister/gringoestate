// Archivo a actualizar: netlify/functions/calculate-rent.js

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { initialAmount, startDate, months } = JSON.parse(event.body);

    if (!initialAmount || !startDate || !months) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Faltan parámetros en la petición.' })
      };
    }
    
    // La API espera el formato YYYY-MM-DD, así que agregamos el día 01
    const fullDate = `${startDate}-01`;

    const rapidApiKey = process.env.RAPIDAPI_KEY;
    if (!rapidApiKey) {
      throw new Error("La API Key de RapidAPI no está configurada en el servidor.");
    }

    // --- CORRECCIÓN CLAVE: Usamos POST y enviamos los datos en el 'body' ---
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
        months: months,
        rate: 'ipc' // La API requiere este campo
      })
    };

    const apiResponse = await fetch('https://arquilerapi1.p.rapidapi.com/calculate', options);
    const data = await apiResponse.json();

    if (!apiResponse.ok) {
      throw new Error(data.message || 'Error en la API externa.');
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
