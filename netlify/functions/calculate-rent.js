// Archivo final: netlify/functions/calculate-rent.js
// Esta versión utiliza los endpoints correctos y presenta un análisis reestructurado.

// --- URLs de las APIs ---
const IPC_API_URL = "https://apis.datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26&limit=5000&format=json";
const DOLAR_API_URL_BLUELYTICS = "https://api.bluelytics.com.ar/v2/evolution.json";
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
            // El endpoint evolution.json devuelve un array, filtramos por 'Blue'
            dolarDataCache = data
                .filter(item => item.source === 'Blue')
                .reduce((acc, item) => {
                    // La fecha viene en el campo 'date'
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
    // Intenta buscar en un rango de 7 días hacia atrás por si es fin de semana o feriado.
    for(let i = 0; i < 7; i++) {
        let d = new Date(date);
        d.setDate(d.getDate() - i);
        const fechaISO = d.toISOString().split('T')[0];

        // 1. Intento con el cache de Bluelytics
        if (dolarDataCache && dolarDataCache[fechaISO]) {
            return dolarDataCache[fechaISO];
        }

        // 2. Fallback: DolarAPI
        try {
            const url = DOLAR_API_URL_DOLARAPI + fechaISO;
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

        // --- LÓGICA DE ANÁLISIS REESTRUCTURADA ---
        let analisis = null;
        if (historial.length > 1) {
            const montoInicialPesos = historial[0].monto;
            const montoFinalPesos = historial[historial.length - 1].monto;
            const variacionPesos = ((montoFinalPesos / montoInicialPesos) - 1) * 100;

            const dolarInicial = historial[0].montoEnDolares;
            const dolarFinal = historial[historial.length - 1].montoEnDolares;
            
            let variacionDolar = null;
            if (dolarInicial && dolarFinal) {
                variacionDolar = ((dolarFinal / dolarInicial) - 1) * 100;
            }

            // Construir el texto del análisis
            const signoDolar = variacionDolar === null ? 'varió' : (variacionDolar >= 0 ? 'subió' : 'bajó');
            const variacionPesosStr = `+${variacionPesos.toFixed(2).replace('.', ',')}%`;
            const variacionDolarStr = variacionDolar !== null ? `${variacionDolar >= 0 ? '+' : ''}${variacionDolar.toFixed(2).replace('.', ',')}%` : 'N/A';
            const dolarInicialStr = dolarInicial ? `USD ${dolarInicial.toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : 'N/A';
            const dolarFinalStr = dolarFinal ? `USD ${dolarFinal.toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : 'N/A';
            
            const descripcionGeneral = `En el período analizado, el alquiler mensual aumentó un <strong>${variacionPesosStr}</strong> en pesos. Medido en USD, el valor del alquiler <strong>${signoDolar}</strong>, pasando de <strong>${dolarInicialStr}</strong> a <strong>${dolarFinalStr}</strong>.`;

            const analisisInquilino = `<h4>Para vos como Inquilino</h4>
                <p>El aumento en pesos fue del <strong>${variacionPesosStr}</strong>. Si tus ingresos son en pesos, deberías haber tenido un aumento similar para no perder poder de compra. Si tus ingresos son en USD, el alquiler es actualmente un <strong>${variacionDolarStr}</strong> más caro/barato para vos.</p>`;
            
            const analisisPropietario = `<h4>Para vos como Propietario</h4>
                <p>Tu ingreso por alquiler, medido en USD, varió un <strong>${variacionDolarStr}</strong>. Esto te ayuda a entender si el rendimiento de tu propiedad en moneda dura mejoró o empeoró durante este período.</p>`;

            analisis = {
                descripcionGeneral,
                analisisInquilino,
                analisisPropietario
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
