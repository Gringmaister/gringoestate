// Archivo a actualizar: netlify/functions/calculate-rent.js

const IPC_API_URL = "https://apis.datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26&limit=5000&format=json";

let ipcDataCache = null;
async function getIpcData() {
    if (ipcDataCache) return ipcDataCache;
    try {
        const response = await fetch(IPC_API_URL);
        if (!response.ok) throw new Error("No se pudo conectar a la API de datos del gobierno.");
        
        const data = await response.json();
        if (!data.data) throw new Error("El formato de datos del IPC no es el esperado.");

        ipcDataCache = data.data.reduce((acc, item) => {
            acc[item[0].substring(0, 7)] = item[1];
            return acc;
        }, {});
        return ipcDataCache;

    } catch (error) {
        console.error("Error al obtener datos del IPC:", error);
        throw error;
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

        const historial = [{
            fecha: new Date(startYear, startMonth - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
            monto: montoActual,
            porcentaje: 0 // El porcentaje inicial es 0
        }];

        let fechaAjuste = new Date(startYear, startMonth - 1, 1);

        while (true) {
            fechaAjuste.setMonth(fechaAjuste.getMonth() + periodo);

            if (fechaAjuste > hoy) {
                break;
            }

            let fechaIndiceNuevo = new Date(fechaAjuste);
            fechaIndiceNuevo.setMonth(fechaIndiceNuevo.getMonth() - 1);
            
            let fechaIndiceBase = new Date(fechaIndiceNuevo);
            fechaIndiceBase.setMonth(fechaIndiceBase.getMonth() - periodo);

            const indiceNuevoStr = `${fechaIndiceNuevo.getFullYear()}-${String(fechaIndiceNuevo.getMonth() + 1).padStart(2, '0')}`;
            const indiceBaseStr = `${fechaIndiceBase.getFullYear()}-${String(fechaIndiceBase.getMonth() + 1).padStart(2, '0')}`;

            const ipcNuevo = ipcData[indiceNuevoStr];
            const ipcBase = ipcData[indiceBaseStr];

            if (ipcBase === undefined || ipcNuevo === undefined) {
                historial.push({ error: `No hay datos de IPC para el ajuste de ${fechaAjuste.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}.` });
                break;
            }

            // --- NUEVO: Cálculo del porcentaje de aumento ---
            const porcentajeAumento = ((ipcNuevo / ipcBase) - 1) * 100;
            
            montoActual = montoActual * (ipcNuevo / ipcBase);
            
            // --- NUEVO: Se añade el porcentaje al historial ---
            historial.push({
                fecha: fechaAjuste.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
                monto: montoActual,
                porcentaje: porcentajeAumento 
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
