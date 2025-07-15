// Archivo a actualizar: netlify/functions/calculate-rent.js

// URLs de las APIs públicas
const IPC_API_URL = "https://apis.datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26&limit=5000&format=json";
const DOLAR_API_URL = "https://api.bluelytics.com.ar/v2/historical";

// Variables para cachear los datos y no llamar a las APIs en cada ejecución
let ipcDataCache = null;
let dolarDataCache = null;

// --- FUNCIÓN MEJORADA: Ahora maneja el fallo de la API de Dólar ---
async function getDolarData() {
    // No reintentar si ya falló en esta sesión.
    if (dolarDataCache === 'failed') return null; 
    if (dolarDataCache) return dolarDataCache;
    
    try {
        const response = await fetch(DOLAR_API_URL, { timeout: 5000 });
        // Si la API falla, no lanzamos un error, simplemente devolvemos null.
        if (!response.ok) {
            console.error("Fallo en la API de Dólar. Se continuará sin datos del dólar.");
            dolarDataCache = 'failed'; // Marcamos como fallida para no reintentar.
            return null;
        }
        const data = await response.json();
        dolarDataCache = data.reduce((acc, item) => {
            acc[item.date] = item.value_sell;
            return acc;
        }, {});
        return dolarDataCache;
    } catch (error) {
        console.error("Error al obtener datos del dólar:", error);
        dolarDataCache = 'failed';
        return null;
    }
}


async function getIpcData() {
    if (ipcDataCache) return ipcDataCache;
    try {
        const response = await fetch(IPC_API_URL, { timeout: 5000 });
        if (!response.ok) throw new Error("Fallo en la API de IPC. No se puede continuar.");
        const data = await response.json();
        if(!data.data) throw new Error("Formato de datos de IPC inesperado.");
        ipcDataCache = data.data.reduce((acc, item) => {
            acc[item[0].substring(0, 7)] = item[1];
            return acc;
        }, {});
        return ipcDataCache;
    } catch (error) { throw error; }
}


exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const [ipcData, dolarData] = await Promise.all([getIpcData(), getDolarData()]);

        // Si la API de IPC falla, es un error crítico.
        if(!ipcData) {
            throw new Error("No se pudieron obtener los datos del IPC para el cálculo.");
        }

        const { initialAmount, startDate, months } = JSON.parse(event.body);
        const montoOriginal = parseFloat(initialAmount);
        const periodo = parseInt(months);

        if (isNaN(montoOriginal) || !startDate || isNaN(periodo)) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Faltan parámetros.' }) };
        }
        
        const [startYear, startMonth] = startDate.split('-').map(Number);
        
        let montoActual = montoOriginal;
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        const historial = [];
        let fechaAjuste = new Date(startYear, startMonth - 1, 1);

        while (true) {
            if (fechaAjuste > hoy && historial.length > 0) {
                break;
            }

            let montoEnDolares = null;
            // Solo intentamos calcular en dólares si la API del dólar funcionó
            if (dolarData) {
                let fechaISO = `${fechaAjuste.getFullYear()}-${String(fechaAjuste.getMonth() + 1).padStart(2, '0')}-${String(fechaAjuste.getDate()).padStart(2, '0')}`;
                let valorDolar = dolarData[fechaISO];
                let diasAtras = 1;
                while(!valorDolar && diasAtras < 5) { // Busca hasta 5 días atrás
                    let fechaAnterior = new Date(fechaAjuste);
                    fechaAnterior.setDate(fechaAnterior.getDate() - diasAtras);
                    let fechaAnteriorISO = `${fechaAnterior.getFullYear()}-${String(fechaAnterior.getMonth() + 1).padStart(2, '0')}-${String(fechaAnterior.getDate()).padStart(2, '0')}`;
                    valorDolar = dolarData[fechaAnteriorISO];
                    diasAtras++;
                }
                if(valorDolar) {
                    montoEnDolares = montoActual / valorDolar;
                }
            }

            let porcentajeAumento = 0;
            
            if (historial.length > 0) {
                const fechaIndiceNuevo = new Date(fechaAjuste);
                fechaIndiceNuevo.setMonth(fechaIndiceNuevo.getMonth() - 1);
                
                const fechaIndiceBase = new Date(fechaIndiceNuevo);
                fechaIndiceBase.setMonth(fechaIndiceBase.getMonth() - periodo);

                const indiceNuevoStr = `${fechaIndiceNuevo.getFullYear()}-${String(fechaIndiceNuevo.getMonth() + 1).padStart(2, '0')}`;
                const indiceBaseStr = `${fechaIndiceBase.getFullYear()}-${String(fechaIndiceBase.getMonth() + 1).padStart(2, '0')}`;

                const ipcNuevo = ipcData[indiceNuevoStr];
                const ipcBase = ipcData[indiceBaseStr];
                
                if (ipcBase === undefined || ipcNuevo === undefined) {
                    historial.push({ error: `No hay datos de IPC para el ajuste de ${fechaAjuste.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}.` });
                    break;
                }
                
                porcentajeAumento = ((ipcNuevo / ipcBase) - 1) * 100;
                montoActual = montoActual * (ipcNuevo / ipcBase);
            }

            historial.push({
                fecha: fechaAjuste.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
                monto: montoActual,
                porcentaje: porcentajeAumento,
                montoEnDolares: montoEnDolares // Será null si la API del dólar falló
            });
            
            if (fechaAjuste > hoy) break;
            fechaAjuste.setMonth(fechaAjuste.getMonth() + periodo);
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
