// Archivo a crear: netlify/functions/calculate-rent.js

exports.handler = async function(event, context) {
  // 1. Solo permitir peticiones POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // 2. Extraer los datos que envía el frontend
    const { initialAmount, startDate, months } = JSON.parse(event.body);

    // Validar que los datos existan
    if (!initialAmount || !startDate || !months) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Faltan parámetros en la petición.' })
      };
    }

    // 3. Construir la URL para la API de RapidAPI
    const rapidApiUrl = `https://arquilerapi1.p.rapidapi.com/calculate?initialAmount=${initialAmount}&startDate=${startDate}&months=${months}`;
    
    // 4. Obtener la llave secreta de las variables de entorno de Netlify
    const rapidApiKey = process.env.RAPIDAPI_KEY;
    if (!rapidApiKey) {
        // Este error solo se verá en los logs del servidor, no en el navegador del usuario.
        throw new Error("La API Key de RapidAPI no está configurada en el servidor.");
    }

    const options = {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': rapidApiKey,
        'X-RapidAPI-Host': 'arquilerapi1.p.rapidapi.com'
      }
    };

    // 5. Llamar a la API externa
    const apiResponse = await fetch(rapidApiUrl, options);
    const data = await apiResponse.json();

    if (!apiResponse.ok) {
        // Si la API de RapidAPI falla, pasar el error al frontend
        throw new Error(data.message || 'Error en la API externa.');
    }

    // 6. Devolver la respuesta exitosa al frontend
    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };

  } catch (error) {
    console.error("Error en la función calculate-rent:", error);
    return {
      statusCode: 500,
      // Devolvemos un mensaje de error genérico al usuario por seguridad
      body: JSON.stringify({ error: error.message })
    };
  }
};
