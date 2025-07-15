// Archivo a actualizar: netlify/functions/calculate-rent.js

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { initialAmount, startDate, months } = JSON.parse(event.body);

    if (!initialAmount || !startDate || !months) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Faltan parámetros en la petición.' }) };
    }
    
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
    
    // --- CORRECCIÓN FINAL: Logging y manejo de respuestas no-JSON ---
    // Clonamos la respuesta para poder leerla dos veces (una como texto, otra como json si es posible)
    const responseClone = apiResponse.clone();
    const responseText = await responseClone.text();
    
    // Logueamos la respuesta cruda en los logs de Netlify para poder espiarla
    console.log("Respuesta cruda de RapidAPI:", responseText); 

    let data;
    try {
        // Intentamos interpretar la respuesta como JSON
        data = JSON.parse(responseText);
    } catch(e) {
        // Si no es JSON, la lanzamos como el error principal.
        throw new Error(`La API externa no devolvió un JSON válido. Respuesta: ${responseText}`);
    }
    // --- FIN DE LA CORRECCIÓN FINAL ---

    if (!apiResponse.ok) {
      const errorMessage = data.message || data.error || "La API externa devolvió un error.";
      throw new Error(errorMessage);
    }

    if (!data.newAmount) {
       const errorMessage = data.message || data.error || "La API externa no devolvió un monto calculado.";
       throw new Error(errorMessage);
    }

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
