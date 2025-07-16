// Archivo de prueba: netlify/functions/calculate-rent.js
// VERSIÓN DE PRUEBA DEFINITIVA: Solo devuelve un error para verificar la conexión.

exports.handler = async function(event, context) {
    const errorMessage = "PRUEBA DEFINITIVA: Si ves este mensaje, el deploy FUNCIONÓ.";
    
    return {
        statusCode: 500, // Un código de error
        body: JSON.stringify({ error: errorMessage })
    };
};
