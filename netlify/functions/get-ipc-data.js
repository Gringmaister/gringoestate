// netlify/functions/get-ipc-data.js
// Este asistente solo tiene un trabajo: llamar al servidor del gobierno y devolver los datos.

exports.handler = async function(event, context) {
  const IPC_API_URL = "https://datos.gob.ar/series/api/series?ids=148.3_INIVELNAL_DICI_M_26&format=json&limit=5000";

  try {
    const response = await fetch(IPC_API_URL);
    const data = await response.json();

    if (!response.ok) {
      throw new Error('Error al obtener datos del servidor del gobierno.');
    }

    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
