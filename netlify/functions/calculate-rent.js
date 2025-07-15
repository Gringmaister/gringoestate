// Archivo a actualizar: netlify/functions/calculate-rent.js

// URLs de las APIs públicas
const IPC_API_URL = "https://apis.datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26&limit=5000&format=json";
const DOLAR_API_URL_BLUELYTICS = "https://api.bluelytics.com.ar/v2/historical";

// Variables para cachear los datos y no llamar a las APIs en cada ejecución
let ipcDataCache = null;
let dolarDataCache = null;

// Obtiene el historial del IPC
async function getIpcData() {
    if (ipcDataCache) return ipcDataCache;
    try {
        const response = await fetch(IPC_API_URL);
        if (!response.ok) throw new Error("Fallo en la API de IPC.");
        const data = await response.json();
        if(!data.data) throw new Error("Formato de datos de IPC inesperado.");
        ipcDataCache = data.data.reduce((acc, item) => {
            acc[item[0].substring(0, 7)] = item[1];
            return acc;
        }, {});
        return ipcDataCache;
    } catch (error) { throw error; }
}

// --- NUEVO: Sistema de Fallback para obtener el Dólar ---
async function getDolarData() {
    // No reintentar si ya falló en esta sesión.
    if (dolarDataCache === 'failed') return null; 
    if (dolarDataCache) return dolarDataCache;
    
    // 1. Intento con Bluelytics (preferido por su data histórica)
    try {
        const response = await fetch(DOLAR_API_URL_BLUELYTICS);
        if (response.ok) {
            const data = await response.json();
            console.log("Éxito al obtener datos de Bluelytics.");
            dolarDataCache = data.reduce((acc, item) => {
                acc[item.date] = item.value_sell;
                return acc;
            }, {});
            return dolarDataCache;
        }
    } catch (e) { console.error("Bluelytics falló. Se continuará sin datos del dólar."); }

    // 2. Si Bluelytics falla, marcamos como fallida y devolvemos null.
    dolarDataCache = 'failed';
    return null;
}

// Función auxiliar para buscar el dólar en una fecha o días anteriores
function findDolarValue(date, data) {
    if (!data) return null;
    let diasAtras = 0;
    while(diasAtras < 7) { // Busca hasta 7 días atrás por si es fin de semana o feriado
        let d = new Date(date);
        d.setDate(d.getDate() - diasAtras);
        let fechaISO = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if(data[fechaISO]) return data[fechaISO];
        diasAtras++;
    }
    return null;
}


exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const [ipcData, dolarData] = await Promise.all([getIpcData(), getDolarData()]);

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
            if (fechaAjuste > hoy && historial.length > 0) break;

            const valorDolar = findDolarValue(fechaAjuste, dolarData);
            const montoEnDolares = valorDolar ? (montoActual / valorDolar) : null;
            
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
                montoEnDolares: montoEnDolares
            });
            
            if (fechaAjuste > hoy) break;
            fechaAjuste.setMonth(fechaAjuste.getMonth() + periodo);
        }

        // --- CÁLCULO DEL ANÁLISIS FINAL MEJORADO ---
        let analisis = null;
        if (historial.length > 1) {
            const montoInicialPesos = historial[0].monto;
            const montoFinalPesos = historial[historial.length - 1].monto;
            const variacionPesos = ((montoFinalPesos / montoInicialPesos) - 1) * 100;

            let variacionDolar = null;
            const dolarInicial = historial[0].montoEnDolares;
            const dolarFinal = historial[historial.length - 1].montoEnDolares;

            if (dolarInicial && dolarFinal) {
                variacionDolar = ((dolarFinal / dolarInicial) - 1) * 100;
            }
            analisis = {
                variacionPesos: variacionPesos,
                variacionDolar: variacionDolar
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ historial: historial, analisis: analisis })
        };

    } catch (error) {
        console.error("Error en la función calculate-rent:", error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
