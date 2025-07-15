// Archivo a actualizar: netlify/functions/calculate-rent.js

// URL de la API de datos del gobierno para el IPC Nacional
const IPC_API_URL = "https://apis.datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26&limit=5000&format=json";

// Función para obtener y cachear los datos del IPC
let ipcDataCache = null;
async function getIpcData() {
    if (ipcDataCache) return ipcDataCache;
    try {
        const response = await fetch(IPC_API_URL);
        if (!response.ok) throw new Error("No se pudo conectar a la API de datos del gobierno.");
        
        const data = await response.json();
        if (!data.data) throw new Error("El formato de datos del IPC no es el esperado.");

        // Creamos un objeto para fácil acceso: { "YYYY-MM": valor }
        ipcDataCache = data.data.reduce((acc, item) => {
            acc[item[0].substring(0, 7)] = item[1];
            return acc;
        }, {});
        return ipcDataCache;

    } catch (error) {
        console.error("Error al obtener datos del IPC:", error);
        throw error; // Relanzamos el error para que sea atrapado por el handler principal
    }
}


exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const { initialAmount, startDate, months } = JSON.parse(event.body);
        const montoOriginal = parseFloat(initialAmount);
        const periodo = parseInt(months);

        if (isNaN(montoOriginal) || !startDate || isNaN(periodo)) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Faltan parámetros en la petición.' }) };
        }

        const ipcData = await getIpcData();
        const [startYear, startMonth] = startDate.split('-').map(Number);
        
        let montoActual = montoOriginal;
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        // Array para guardar el historial de actualizaciones
        const historial = [{
            fecha: new Date(startYear, startMonth - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
            monto: montoActual
        }];

        let fechaAjuste = new Date(startYear, startMonth - 1, 1);

        while (true) {
            // Calculamos la próxima fecha de ajuste
            fechaAjuste.setMonth(fechaAjuste.getMonth() + periodo);

            // Si la próxima fecha de ajuste es en el futuro, paramos.
            if (fechaAjuste > hoy) {
                break;
            }

            // El índice para el cálculo se toma del mes anterior a la fecha de ajuste
            let fechaIndiceNuevo = new Date(fechaAjuste);
            fechaIndiceNuevo.setMonth(fechaIndiceNuevo.getMonth() - 1);
            
            let fechaIndiceBase = new Date(fechaIndiceNuevo);
            fechaIndiceBase.setMonth(fechaIndiceBase.getMonth() - periodo);

            const indiceNuevoStr = `${fechaIndiceNuevo.getFullYear()}-${String(fechaIndiceNuevo.getMonth() + 1).padStart(2, '0')}`;
            const indiceBaseStr = `${fechaIndiceBase.getFullYear()}-${String(fechaIndiceBase.getMonth() + 1).padStart(2, '0')}`;

            const ipcNuevo = ipcData[indiceNuevoStr];
            const ipcBase = ipcData[indiceBaseStr];

            if (ipcBase === undefined || ipcNuevo === undefined) {
                // Si falta algún dato, nos detenemos y devolvemos lo que tenemos hasta ahora.
                historial.push({ error: `No hay datos de IPC para el ajuste de ${fechaAjuste.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}.` });
                break;
            }

            montoActual = montoActual * (ipcNuevo / ipcBase);
            historial.push({
                fecha: fechaAjuste.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
                monto: montoActual
            });
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ historial: historial })
        };

    } catch (error) {
        console.error("Error en la función calculate-rent:", error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
