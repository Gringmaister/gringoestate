// netlify/functions/calculate-rent.js

// --- URLs de las APIs ---
const IPC_API_URL = "https://apis.datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26&limit=5000&format=json";
const DOLAR_API_URL_BLUELYTICS = "https://api.bluelytics.com.ar/v2/evolution.json";
const DOLAR_API_URL_DOLARAPI = "https://dolarapi.com/v1/dolares/blue/";
const DOLAR_API_URL_CRIPTOYA = "https://criptoya.com/api/dolar";

// --- Caches para optimizar ---
let ipcDataCache = null;
let dolarDataCache = null;

// --- Funciones de obtención de datos (con cache) ---
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
            dolarDataCache = data
                .filter(item => item.source === 'Blue')
                .reduce((acc, item) => {
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
    if (dolarDataCache) {
        for(let i = 0; i < 7; i++) {
            let d = new Date(date); d.setDate(d.getDate() - i);
            if(dolarDataCache[d.toISOString().split('T')[0]]) return dolarDataCache[d.toISOString().split('T')[0]];
        }
    }
    for (let i = 0; i < 7; i++) {
        let d = new Date(date); d.setDate(d.getDate() - i);
        try {
            const response = await fetch(DOLAR_API_URL_DOLARAPI + d.toISOString().split('T')[0]);
            if (response.ok) { const data = await response.json(); if (data.venta) return data.venta; }
        } catch (error) { /* Seguir intentando */ }
    }
    try {
        const response = await fetch(DOLAR_API_URL_CRIPTOYA);
        if(response.ok) { const data = await response.json(); if (data.blue) return data.blue; }
    } catch(e) { /* Falló el último recurso */ }
    return null;
}

// --- Handler principal de la función ---
exports.handler = async function(event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const [ipcData, _] = await Promise.all([getIpcData(), getDolarData()]);
        if(!ipcData) throw new Error("No se pudieron obtener los datos del IPC.");

        const { initialAmount, startDate, months } = JSON.parse(event.body);
        const montoOriginal = parseFloat(initialAmount);
        const periodo = parseInt(months);
        const [startYear, startMonth, startDay] = startDate.split('-').map(Number);

        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        // --- Inicialización de variables para el análisis ---
        const historial = [];
        const chartData = { labels: [], actualRentData: [], idealRentData: [], usdRentData: [] };
        let montoActual = montoOriginal;
        let montoIdeal = montoOriginal;
        let fechaActual = new Date(startYear, startMonth - 1, startDay);
        let proximoAjuste = new Date(startYear, startMonth - 1, startDay);
        proximoAjuste.setMonth(proximoAjuste.getMonth() + periodo);

        let inflacionTotalAcumulada = 1;

        // --- Bucle principal para generar historial y datos del gráfico mes a mes ---
        while (fechaActual <= hoy) {
            // 1. Calcular IPC del mes anterior para el "Alquiler Ideal"
            const fechaIndiceIdeal = new Date(fechaActual);
            fechaIndiceIdeal.setMonth(fechaIndiceIdeal.getMonth() - 1);
            const indiceIdealStr = `${fechaIndiceIdeal.getFullYear()}-${String(fechaIndiceIdeal.getMonth() + 1).padStart(2, '0')}`;
            const indiceBaseIdealStr = `${startYear}-${String(startMonth).padStart(2, '0')}`;
            
            if (ipcData[indiceIdealStr] && ipcData[indiceBaseIdealStr] && fechaActual.getTime() !== new Date(startYear, startMonth - 1, startDay).getTime()) {
                 montoIdeal = montoOriginal * (ipcData[indiceIdealStr] / ipcData[indiceBaseIdealStr]);
                 inflacionTotalAcumulada = (ipcData[indiceIdealStr] / ipcData[indiceBaseIdealStr]);
            } else {
                montoIdeal = montoActual;
            }

            // 2. Realizar ajuste si corresponde
            if (fechaActual >= proximoAjuste) {
                 const fechaIndiceNuevo = new Date(proximoAjuste);
                 fechaIndiceNuevo.setMonth(fechaIndiceNuevo.getMonth() - 1);
                 const fechaIndiceBase = new Date(fechaIndiceNuevo);
                 fechaIndiceBase.setMonth(fechaIndiceBase.getMonth() - periodo);

                 const ipcNuevo = ipcData[`${fechaIndiceNuevo.getFullYear()}-${String(fechaIndiceNuevo.getMonth() + 1).padStart(2, '0')}`];
                 const ipcBase = ipcData[`${fechaIndiceBase.getFullYear()}-${String(fechaIndiceBase.getMonth() + 1).padStart(2, '0')}`];
                 
                 if (ipcBase && ipcNuevo) {
                    const porcentajeAumento = ((ipcNuevo / ipcBase) - 1) * 100;
                    montoActual = montoActual * (ipcNuevo / ipcBase);
                    const valorDolar = await getDolarValueForDate(proximoAjuste);
                    historial.push({
                        fecha: proximoAjuste.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
                        monto: montoActual,
                        porcentaje: porcentajeAumento,
                        montoEnDolares: valorDolar ? (montoActual / valorDolar) : null
                    });
                 }
                 proximoAjuste.setMonth(proximoAjuste.getMonth() + periodo);
            }
            
            // 3. Añadir datos al gráfico para el mes actual
            const valorDolarActual = await getDolarValueForDate(fechaActual);
            chartData.labels.push(fechaActual.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }));
            chartData.actualRentData.push(montoActual);
            chartData.idealRentData.push(montoIdeal);
            chartData.usdRentData.push(valorDolarActual ? (montoActual / valorDolarActual) : null);

            // 4. Avanzar al siguiente mes
            fechaActual.setMonth(fechaActual.getMonth() + 1);
        }
        
        // Agregar el primer punto al historial si no está
        if (historial.length === 0 || historial[0].monto !== montoOriginal) {
            const valorDolarInicial = await getDolarValueForDate(new Date(startYear, startMonth - 1, startDay));
            historial.unshift({
                fecha: new Date(startYear, startMonth - 1, startDay).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
                monto: montoOriginal,
                porcentaje: 0,
                montoEnDolares: valorDolarInicial ? (montoOriginal / valorDolarInicial) : null
            });
        }

        // --- Generar Análisis Detallado ---
        let detailedAnalysis = null;
        if (historial.length > 1) {
            const montoFinalPesos = historial[historial.length - 1].monto;
            const aumentoTotalPesos = ((montoFinalPesos / montoOriginal) - 1) * 100;
            const inflacionTotalPeriodo = (inflacionTotalAcumulada - 1) * 100;

            let variacionDolar = null;
            const dolarInicial = historial[0].montoEnDolares;
            const dolarFinal = historial[historial.length - 1].montoEnDolares;
            if (dolarInicial && dolarFinal) {
                variacionDolar = ((dolarFinal / dolarInicial) - 1) * 100;
            }

            detailedAnalysis = {
                aumentoTotalPesos,
                inflacionTotalPeriodo,
                variacionDolar
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ historial, detailedAnalysis, chartData })
        };

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
