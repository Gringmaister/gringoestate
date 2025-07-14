// Archivo: netlify/functions/get-ipc-data.js

exports.handler = async function(event, context) {
  // URL de la API corregida y funcional
  const IPC_API_URL = "https://apis.datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26&limit=5000&format=json";

  try {
    const response = await fetch(IPC_API_URL);

    // Si la respuesta de la API externa no es exitosa, lanzamos un error
    if (!response.ok) {
      throw new Error(`Error del servidor del gobierno: ${response.statusText}`);
    }

    const data = await response.json();

    // Si todo sale bien, devolvemos los datos con un código de estado 200 (OK)
    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };

  } catch (error) {
    // Si ocurre algún error durante el proceso, lo capturamos
    // y devolvemos un error 500 (Error Interno del Servidor)
    console.error("Error en la función de Netlify:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
