// Archivo a actualizar: netlify/functions/calculate-rent.js
// VERSIÓN DE DEBUG: Lanza un error visible si las APIs de dólar fallan.

const IPC_API_URL = "https://apis.datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26&limit=5000&format=json";
const DOLAR_API_URL_BLUELYTICS = "https://api.bluelytics.com.ar/v2/historical";
const DOLAR_API_URL_DOLARAPI = "https://dolarapi.com/v1/dolares/blue/";
const DOLAR_API_URL_CRIPTOYA = "https://criptoya.com/api/dolar";

let ipcDataCache = null;
let dolarDataCache = null;

async function getIpcData() {
    if (ipcDataCache) return ipcDataCache;
    try {
        const response = await fetch(IPC_API_URL);
        if (!response.ok) throw new Error(`Fallo en la API de IPC (datos.gob.ar). Código: ${response.status}`);
        const data = await response.json();
        if(!data.data) throw new Error("Formato de datos de IPC inesperado.");
        ipcDataCache = data.data.reduce((acc, item) => {
            acc[item[0].substring(0, 7)] = item[1];
            return acc;
        }, {});
        return ipcDataCache;
    } catch (error) { throw error; }
}

async function getDolarData() {
    if (dolarDataCache) return dolarDataCache;
    try {
        const response = await fetch(DOLAR_API_URL_BLUELYTICS);
        if (response.ok) {
            const data = await response.json();
            dolarDataCache = data.reduce((acc, item) => {
                acc[item.date] = item.value_sell;
                return acc;
            }, {});
            return dolarDataCache;
        }
    } catch (e) {
        // No hacer nada, se usará el fallback
    }
    dolarDataCache = null;
    return null;
}

async function getDolarValueForDate(date) {
    if (dolarDataCache) {
        for(let i = 0; i < 7; i++) {
            let d = new Date(date);
            d.setDate(d.getDate() - i);
            let fechaISO = d.toISOString().split('T')[0];
            if(dolarDataCache[fechaISO]) return dolarDataCache[fechaISO];
        }
    }

    for (let i = 0; i < 7; i++) {
        let d = new Date(date);
        d.setDate(d.getDate() - i);
        const fechaISO = d.toISOString().split('T')[0];
        const url = DOLAR_API_URL_DOLARAPI + fechaISO;
        try {
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                if (data.venta) return data.venta;
            }
        } catch (error) { /* Seguir intentando */ }
    }

    try {
        const response = await fetch(DOLAR_API_URL_CRIPTOYA);
        if(response.ok) {
            const data = await response.json();
            if (data.blue) return data.blue;
        }
    } catch(e) { /* Falló el último recurso */ }

    // ***** MODIFICACIÓN CLAVE *****
    // Si llegamos aquí, todas las APIs fallaron. En lugar de devolver null, lanzamos un error.
    throw new Error('Todas las APIs de Dólar (Bluelytics, DolarAPI, CriptoYa) fallaron. No se pudo obtener la cotización.');
}


exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const { initialAmount, startDate, months } = JSON.parse(event.body);
        
        // Validaciones iniciales
        if (!initialAmount || !startDate || !months) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Faltan parámetros: initialAmount, startDate y months son requeridos.' }) };
        }
        
        const [ipcData, _] = await Promise.all([getIpcData(), getDolarData()]);

        if(!ipcData) {
            throw new Error("No se pudieron obtener los datos del IPC para el cálculo.");
        }

        const montoOriginal = parseFloat(initialAmount);
        const periodo = parseInt(months);
        const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
        
        let montoActual = montoOriginal;
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        const historial = [];
        let fechaAjuste = new Date(startYear, startMonth - 1, startDay);

        while (true) {
            if (fechaAjuste > hoy && historial.length > 0) break;

            const valorDolar = await getDolarValueForDate(fechaAjuste);
            
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
                montoEnDolares: valorDolar ? (montoActual / valorDolar) : null
            });
            
            if (fechaAjuste > hoy) break;
            fechaAjuste.setMonth(fechaAjuste.getMonth() + periodo);
        }

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
        // Si algo falla (incluyendo nuestro nuevo error de las APIs de dólar), se enviará este mensaje.
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
