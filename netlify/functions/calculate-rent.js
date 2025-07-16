// Archivo a actualizar: netlify/functions/calculate-rent.js

// URLs de las APIs públicas en orden de prioridad
const IPC_API_URL = "https://apis.datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26&limit=5000&format=json";
const DOLAR_API_URL_BLUELYTICS = "https://api.bluelytics.com.ar/v2/historical"; // Mejor para datos históricos
const DOLAR_API_URL_DOLARAPI = "https://dolarapi.com/v1/dolares/blue/"; // Fallback para fechas específicas
const DOLAR_API_URL_CRIPTOYA = "https://criptoya.com/api/dolar"; // Último recurso para valor actual

// Variables para cachear los datos
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
    if (dolarDataCache) return dolarDataCache;
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
    } catch (e) { console.error("Bluelytics (histórico) falló. Se usará fallback por fecha."); }
    
    // Si Bluelytics falla, marcamos el cache como nulo para intentar el otro método.
    dolarDataCache = null; 
    return null;
}

// Función para obtener el valor del dólar para una fecha específica con fallbacks
async function getDolarValueForDate(date) {
    // 1. Intento con el cache de Bluelytics si existe
    if (dolarDataCache) {
        let diasAtras = 0;
        while(diasAtras < 7) {
            let d = new Date(date);
            d.setDate(d.getDate() - diasAtras);
            let fechaISO = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            if(dolarDataCache[fechaISO]) return dolarDataCache[fechaISO];
            diasAtras++;
        }
    }

    // 2. Fallback: Intento con DolarAPI para la fecha específica
    for (let i = 0; i < 7; i++) {
        let d = new Date(date);
        d.setDate(d.getDate() - i);
        const fechaISO = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const url = DOLAR_API_URL_DOLARAPI + fechaISO;
        try {
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                if (data.venta) return data.venta;
            }
        } catch (error) { console.error(`Fallo DolarAPI para ${fechaISO}`); }
    }
    
    // 3. Último recurso: CriptoYa (valor actual)
    try {
        const response = await fetch(DOLAR_API_URL_CRIPTOYA);
        if(response.ok) {
            const data = await response.json();
            return data.blue;
        }
    } catch(e) { console.error("CriptoYa falló."); }

    return null;
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

            const valorDolar = await getDolarValueForDate(fechaAjuste);
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
        console.error("Error en el handler principal:", error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
