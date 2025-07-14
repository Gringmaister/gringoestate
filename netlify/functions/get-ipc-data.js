// Archivo: netlify/functions/get-ipc-data.js

/**
 * Este handler de Netlify actúa como un proxy seguro para evitar errores de CORS.
 * Llama a la API del gobierno para obtener los datos del IPC y los devuelve
 * desde el mismo dominio que el sitio web.
 */
exports.handler = async function(event, context) {
  // URL de la API oficial para el Índice de Precios al Consumidor (IPC)
  const IPC_API_URL = "https://datos.gob.ar/series/api/series?ids=148.3_INIVELNAL_DICI_M_26&format=json&limit=5000";

  try {
    // Realizamos la llamada a la API externa
    const response = await fetch(IPC_API_URL);
    const data = await response.json();

    // Si la respuesta de la API externa no es exitosa, lanzamos un error
    if (!response.ok) {
      throw new Error('Error al obtener datos del servidor del gobierno.');
    }

    // Si todo sale bien, devolvemos los datos con un código de estado 200 (OK)
    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };
  } catch (error) {
    // Si ocurre algún error durante el proceso, lo capturamos
    // y devolvemos un error 500 (Error Interno del Servidor)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
