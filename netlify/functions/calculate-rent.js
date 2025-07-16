// Archivo final: netlify/functions/calculate-rent.js
// Esta versión utiliza los endpoints correctos de las APIs y maneja los fallos.

// --- URLs de las APIs ---
const IPC_API_URL = "https://apis.datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26&limit=5000&format=json";
const DOLAR_API_URL_BLUELYTICS = "https://api.bluelytics.com.ar/v2/evolution.json"; // URL CORREGIDA
const DOLAR_API_URL_DOLARAPI = "https://dolarapi.com/v1/dolares/blue/";
const DOLAR_API_URL_CRIPTOYA = "https://criptoya.com/api/dolar";

let ipcDataCache = null;
let dolarDataCache = null;

async function getIpcData() {
    if (ipcDataCache) return ipcDataCache;
    try {
        const response = await fetch(IPC_API_URL);
        if (!response.ok) return null;
        const data = await response.json();
        if(!data.data) return null;
        ipcDataCache = data.data.reduce((acc, item) => {
            acc[item[0].substring(0, 7)] = item[1];
            return acc;
        }, {});
        return ipcDataCache;
    } catch (error) { return null; }
}

async function getDolarData() {
    if (dolarDataCache) return dolarDataCache;
    try {
        const response = await fetch(DOLAR_API_URL_BLUELYTICS);
        if (response.ok) {
            const data = await response.json();
            // El nuevo endpoint devuelve una lista con 'oficial' y 'blue', debemos filtrar
            dolarDataCache = data
                .filter(item => item.source === 'Blue') // El campo correcto es 'source'
                .reduce((acc, item) => {
                    // El nuevo campo de fecha se llama 'date'
                    acc[item.date] = item.value_sell;
                    return acc;
                }, {});
            return dolarDataCache;
        }
    } catch (e) { /* Falla silenciosa para pasar al siguiente fallback */ }
    dolarDataCache = null;
    return null;
}

async function getDolarValueForDate(date) {
    const fechaISO = date.toISOString().split('T')[0];

    // 1. Intento con el cache de Bluelytics (evolution.json)
    if (dolarDataCache) {
        for(let i = 0; i < 7; i++) {
            let d = new Date(date);
            d.setDate(d.getDate() - i);
            let dISO = d.toISOString().split('T')[0];
            if(dolarDataCache[dISO]) return dolarDataCache[dISO];
        }
    }

    // 2. Fallback: DolarAPI
    for (let i = 0; i < 7; i++) {
        let d = new Date(date);
        d.setDate(d.getDate() - i);
        const dISO = d.toISOString().split('T')[0];
        const url = DOLAR_API_URL_DOLARAPI + dISO;
        try {
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                if (data.venta) return data.venta;
            }
        } catch (error) { /* Seguir intentando */ }
    }

    // 3. Último recurso: CriptoYa (valor actual)
    try {
        const response = await fetch(DOLAR_API_URL_CRIPTOYA);
        if(response.ok) {
            const data = await response.json();
            if (data.blue) return data.blue;
        }
    } catch(e) { /* Falló el último recurso */ }

    return null; // Devuelve null si todo falla
}

exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const [ipcData, _] = await Promise.all([getIpcData(), getDolarData()]);

        if(!ipcData) {
            throw new Error("No se pudieron obtener los datos del IPC para el cálculo.");
        }

        const { initialAmount, startDate, months } = JSON.parse(event.body);
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
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
