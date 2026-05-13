function buildUriburuRevenueSnapshot() {
  return {
    ok: true,
    source: 'simulated',
    building: {
      name: 'Uriburu 1070',
      unit: '201',
      neighborhood: 'Recoleta, CABA',
      currency: 'USD'
    },
    period: {
      label: 'Mayo 2026',
      generatedAt: new Date().toISOString()
    },
    kpis: {
      units: 1,
      occupancyPct: 86,
      adrUsd: 58,
      bookedNights: 26,
      availableNights: 30,
      grossRevenueUsd: 1508,
      operatingCostsUsd: 392,
      netMarginUsd: 1116,
      netMarginPct: 74
    },
    units: [
      {
        id: 'uriburu-201',
        label: 'Uriburu 201',
        status: 'active',
        occupancyPct: 86,
        adrUsd: 58,
        bookedNights: 26,
        availableNights: 30,
        grossRevenueUsd: 1508,
        operatingCostsUsd: 392,
        netMarginUsd: 1116,
        netMarginPct: 74,
        nextCheckIn: '2026-05-15',
        nextCheckOut: '2026-05-20'
      }
    ],
    revenueBreakdown: {
      accommodationUsd: 1392,
      cleaningFeesUsd: 116,
      extrasUsd: 0,
      totalUsd: 1508
    },
    alerts: [
      {
        level: 'warning',
        title: 'Hueco de ocupación detectado',
        detail: 'Quedan 4 noches disponibles en la ventana simulada; revisar pricing o promo táctica.'
      },
      {
        level: 'ok',
        title: 'Margen saludable',
        detail: 'Margen neto simulado de 74%, por encima del umbral operativo.'
      }
    ]
  };
}

exports.handler = async function () {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify(buildUriburuRevenueSnapshot())
  };
};

exports.buildUriburuRevenueSnapshot = buildUriburuRevenueSnapshot;
