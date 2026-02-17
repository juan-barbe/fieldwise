// ===== INC Land Investment Dashboard =====
// Reactive dashboard with filters, choropleth maps, histograms, scatter plot,
// and department economics table for investment analysis.

let ALL_DATA = [];
let FILTERED = [];
let GEO_DATA = null;
let CHARTS = {};
let SORT_STATE = { col: 'name', asc: true };
let INC_SORT_STATE = { col: 'pctChange', asc: false };
let ACTIVE_TAB = 'tabDashboard';

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.plugins.legend.labels.boxWidth = 12;
    Chart.defaults.plugins.legend.labels.padding = 10;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.pointStyle = 'rectRounded';

    Promise.all([loadCSV(), loadGeoJSON()]).then(() => {
        populateFilters();
        bindFilters();
        bindTabs();
        applyFilters();
        setTimeout(() => document.getElementById('loadingOverlay').classList.add('hidden'), 300);
    });
});

// ===== Colors =====
const C = {
    blue: '#6391ff', green: '#34d399', purple: '#a78bfa', orange: '#fb923c', red: '#f87171',
    cyan: '#22d3ee', pink: '#f472b6', yellow: '#fbbf24', lime: '#a3e635', teal: '#2dd4bf',
    indigo: '#818cf8', rose: '#fb7185', amber: '#f59e0b', emerald: '#10b981', sky: '#38bdf8',
    fuchsia: '#d946ef', violet: '#8b5cf6', slate: '#64748b'
};
const PAL = Object.values(C);

// ===== Data Loading =====
function loadCSV() {
    return new Promise((resolve, reject) => {
        Papa.parse('data.csv', {
            download: true, delimiter: ';', header: true, skipEmptyLines: true,
            complete: r => { ALL_DATA = cleanData(r.data); resolve(); },
            error: e => { console.error(e); reject(e); }
        });
    });
}

function loadGeoJSON() {
    return fetch('uruguay.geojson')
        .then(r => r.json())
        .then(d => { GEO_DATA = d; })
        .catch(e => console.warn('GeoJSON no disponible:', e));
}

function cleanData(raw) {
    return raw.map(row => {
        const precio = parseNum(row['Precio total']);
        const sup = parseNum(row['Superficie total(ha)']);
        const deptos = extractDeptos(row['Padrones'] || '');
        const fecha = parseDate(row['Fecha ingreso trámite']);
        let tipo = (row['Tipo'] || '').trim();
        if (tipo.includes('5')) tipo = 'Art. 5°';
        else if (tipo.includes('35')) tipo = 'Art. 35°';
        else if (tipo.toLowerCase().includes('directo')) tipo = 'Directo';
        return {
            tipo, fecha, fechaStr: (row['Fecha ingreso trámite'] || '').trim(),
            tipoNegocio: (row['Tipo de negocio'] || '').trim(),
            expediente: (row['Nº expediente'] || '').trim(),
            estado: (row['Estado de ocupación'] || '').trim(),
            precio, superficie: sup,
            pxHa: (sup > 0 && precio > 0) ? precio / sup : null,
            departamentos: deptos,
            depto: deptos[0] || 'Sin datos',
        };
    }).filter(r => r.expediente || r.precio > 0 || r.superficie > 0);
}

function parseNum(s) {
    if (!s) return 0;
    let c = s.replace(/[^\d,.\-]/g, '');
    if (c.includes(',') && c.includes('.')) c = c.replace(/\./g, '').replace(',', '.');
    else if (c.includes(',')) c = c.replace(',', '.');
    const n = parseFloat(c);
    return isNaN(n) ? 0 : n;
}

function extractDeptos(p) {
    const ds = []; let m;
    const rx = /([A-Za-záéíóúñÁÉÍÓÚÑü\s]+)->/g;
    while ((m = rx.exec(p)) !== null) { const d = m[1].trim(); if (d && !ds.includes(d)) ds.push(d); }
    return ds;
}

function parseDate(s) {
    if (!s) return null;
    const p = s.trim().split('/');
    return p.length === 3 ? new Date(+p[2], +p[1] - 1, +p[0]) : null;
}

function fmt(n, d = 0) {
    if (n == null || isNaN(n)) return '—';
    return n.toLocaleString('es-UY', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function median(arr) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ===== Filters =====
function populateFilters() {
    const deptos = new Set(), tipos = new Set(), negocios = new Set(), estados = new Set(), years = new Set();
    ALL_DATA.forEach(r => {
        r.departamentos.forEach(d => deptos.add(d));
        if (r.tipo) tipos.add(r.tipo);
        if (r.tipoNegocio) negocios.add(r.tipoNegocio);
        if (r.estado) estados.add(r.estado);
        if (r.fecha) years.add(r.fecha.getFullYear());
    });
    addOptions('filterDepto', [...deptos].sort());
    addOptions('filterTipo', [...tipos].sort());
    addOptions('filterNegocio', [...negocios].sort());
    addOptions('filterEstado', [...estados].sort());
    const sortedYears = [...years].sort();
    addOptions('filterMinYear', sortedYears);
    addOptions('filterMaxYear', sortedYears);
}

function addOptions(id, items) {
    const sel = document.getElementById(id);
    items.forEach(item => {
        const o = document.createElement('option');
        o.value = item; o.textContent = item;
        sel.appendChild(o);
    });
}

function bindFilters() {
    ['filterDepto', 'filterTipo', 'filterNegocio', 'filterEstado', 'filterMinYear', 'filterMaxYear'].forEach(id => {
        document.getElementById(id).addEventListener('change', applyFilters);
    });
    document.getElementById('btnReset').addEventListener('click', () => {
        ['filterDepto', 'filterTipo', 'filterNegocio', 'filterEstado', 'filterMinYear', 'filterMaxYear'].forEach(id => {
            document.getElementById(id).value = '';
        });
        applyFilters();
    });
    // Table sorting
    document.querySelectorAll('#deptoTable th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.sort;
            if (SORT_STATE.col === col) SORT_STATE.asc = !SORT_STATE.asc;
            else { SORT_STATE.col = col; SORT_STATE.asc = col === 'name'; }
            document.querySelectorAll('#deptoTable th.sortable').forEach(h => {
                h.classList.remove('active-sort');
                h.textContent = h.textContent.replace(/ [▲▼]/g, '');
            });
            th.classList.add('active-sort');
            th.textContent += SORT_STATE.asc ? ' ▲' : ' ▼';
            renderDeptoTable(FILTERED);
        });
    });
}

function applyFilters() {
    const fd = document.getElementById('filterDepto').value;
    const ft = document.getElementById('filterTipo').value;
    const fn = document.getElementById('filterNegocio').value;
    const fe = document.getElementById('filterEstado').value;
    const fy1 = document.getElementById('filterMinYear').value;
    const fy2 = document.getElementById('filterMaxYear').value;

    FILTERED = ALL_DATA.filter(r => {
        if (fd && !r.departamentos.includes(fd)) return false;
        if (ft && r.tipo !== ft) return false;
        if (fn && r.tipoNegocio !== fn) return false;
        if (fe && r.estado !== fe) return false;
        if (fy1 && r.fecha && r.fecha.getFullYear() < +fy1) return false;
        if (fy2 && r.fecha && r.fecha.getFullYear() > +fy2) return false;
        return true;
    });
    renderAll();
}

// ===== Render Pipeline =====
function renderAll() {
    renderKPIs();
    renderMaps();
    renderHistograms();
    renderScatter();
    renderTimeline();
    renderBarDepto();
    renderMiniCharts();
    renderDeptoTable(FILTERED);
    renderTopTable();
    renderIncremento();
}

// ===== KPIs =====
function renderKPIs() {
    const d = FILTERED;
    document.getElementById('filteredCount').textContent = fmt(d.length);
    document.getElementById('totalCount').textContent = fmt(ALL_DATA.length);
    document.getElementById('kpiTransacciones').textContent = fmt(d.length);
    document.getElementById('kpiValorTotal').textContent = 'U$S ' + fmt(d.reduce((s, r) => s + r.precio, 0));
    document.getElementById('kpiSuperficie').textContent = fmt(d.reduce((s, r) => s + r.superficie, 0));
    const pxha = d.filter(r => r.pxHa && r.pxHa < 100000).map(r => r.pxHa);
    const avg = pxha.length ? pxha.reduce((a, b) => a + b, 0) / pxha.length : 0;
    document.getElementById('kpiAvgPrecio').textContent = fmt(avg, 0);
    document.getElementById('kpiMedianPrecio').textContent = fmt(median(pxha), 0);
}

// ===== Maps =====
function renderMaps() {
    if (!GEO_DATA) {
        document.getElementById('mapPrecio').innerHTML = '<p style="color:var(--text-muted);text-align:center">Mapa no disponible</p>';
        document.getElementById('mapCount').innerHTML = '<p style="color:var(--text-muted);text-align:center">Mapa no disponible</p>';
        return;
    }
    const deptoStats = computeDeptoStats(FILTERED);

    // Price map
    const priceVals = Object.values(deptoStats).map(s => s.avgPxHa).filter(v => v > 0);
    const priceMax = Math.max(...priceVals, 1);
    renderChoropleth('mapPrecio', deptoStats, 'avgPxHa', priceMax,
        ['#0e2a47', '#1a4b7a', '#2d6da3', '#4ea8de', '#7dd3fc', '#bae6fd'],
        v => 'U$S ' + fmt(v, 0) + '/ha');

    // Count map
    const countVals = Object.values(deptoStats).map(s => s.count);
    const countMax = Math.max(...countVals, 1);
    renderChoropleth('mapCount', deptoStats, 'count', countMax,
        ['#1a1a2e', '#2d1b4e', '#4a1a6b', '#7c3aed', '#a78bfa', '#ddd6fe'],
        v => fmt(v, 0) + ' transacciones');
}

function getActiveDeptoFilter() {
    return document.getElementById('filterDepto').value || null;
}

function computeDeptoStats(data) {
    const stats = {};
    const activeDepto = getActiveDeptoFilter();
    data.forEach(r => {
        // When a department filter is active, only aggregate for that department
        // to avoid leaking other departments from multi-department records
        const deptosToCount = activeDepto
            ? r.departamentos.filter(d => d === activeDepto)
            : r.departamentos;
        deptosToCount.forEach(d => {
            if (!stats[d]) stats[d] = { count: 0, totalVal: 0, totalHa: 0, pxHaArr: [] };
            stats[d].count++;
            stats[d].totalVal += r.precio;
            stats[d].totalHa += r.superficie / r.departamentos.length;
            if (r.pxHa && r.pxHa < 100000) stats[d].pxHaArr.push(r.pxHa);
        });
    });
    for (const [d, s] of Object.entries(stats)) {
        s.avgPxHa = s.pxHaArr.length ? s.pxHaArr.reduce((a, b) => a + b, 0) / s.pxHaArr.length : 0;
        s.medPxHa = median(s.pxHaArr);
        s.minPxHa = s.pxHaArr.length ? Math.min(...s.pxHaArr) : 0;
        s.maxPxHa = s.pxHaArr.length ? Math.max(...s.pxHaArr) : 0;
        s.avgSize = s.count > 0 ? s.totalHa / s.count : 0;
    }
    return stats;
}

function renderChoropleth(containerId, stats, metric, maxVal, colorScale, tooltipFmt) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    const w = container.clientWidth || 500;
    const h = container.clientHeight - 30 || 380;

    const svg = d3.select('#' + containerId).append('svg')
        .attr('viewBox', `0 0 ${w} ${h}`)
        .attr('preserveAspectRatio', 'xMidYMid meet');

    const projection = d3.geoMercator().fitSize([w - 20, h - 40], GEO_DATA);
    const pathGen = d3.geoPath().projection(projection);
    const scale = d3.scaleSequential(t => {
        const colors = colorScale;
        const i = Math.min(Math.floor(t * colors.length), colors.length - 1);
        return colors[i];
    }).domain([0, maxVal]);

    const tooltip = document.getElementById('mapTooltip');

    svg.selectAll('path')
        .data(GEO_DATA.features)
        .enter().append('path')
        .attr('d', pathGen)
        .attr('class', 'dept-path')
        .attr('fill', d => {
            const name = d.properties.NAME_1;
            const s = stats[name];
            return s ? scale(s[metric]) : '#1a2235';
        })
        .on('mouseenter', (event, d) => {
            const name = d.properties.NAME_1;
            const s = stats[name];
            tooltip.style.display = 'block';
            tooltip.innerHTML = `<div class="tt-name">${name}</div>` +
                (s ? `<div class="tt-row"><span>Transacciones</span><span class="tt-val">${s.count}</span></div>
                      <div class="tt-row"><span>Valor total</span><span class="tt-val">U$S ${fmt(s.totalVal)}</span></div>
                      <div class="tt-row"><span>Superficie</span><span class="tt-val">${fmt(s.totalHa)} ha</span></div>
                      <div class="tt-row"><span>Prom. USD/ha</span><span class="tt-val">${fmt(s.avgPxHa)}</span></div>
                      <div class="tt-row"><span>Mediana USD/ha</span><span class="tt-val">${fmt(s.medPxHa)}</span></div>`
                    : '<div class="tt-row"><span>Sin datos</span></div>');
        })
        .on('mousemove', event => {
            tooltip.style.left = (event.clientX + 14) + 'px';
            tooltip.style.top = (event.clientY - 10) + 'px';
        })
        .on('mouseleave', () => { tooltip.style.display = 'none'; });

    // Department labels
    svg.selectAll('text')
        .data(GEO_DATA.features)
        .enter().append('text')
        .attr('x', d => pathGen.centroid(d)[0])
        .attr('y', d => pathGen.centroid(d)[1])
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('fill', '#cbd5e1')
        .attr('font-size', '8px')
        .attr('font-weight', '600')
        .attr('pointer-events', 'none')
        .text(d => {
            const name = d.properties.NAME_1;
            // Abbreviate long names
            const abbrevs = { 'Treinta y Tres': '33', 'Cerro Largo': 'C.Largo', 'Río Negro': 'R.Negro', 'San José': 'S.José', 'Tacuarembó': 'Tacbo.' };
            return abbrevs[name] || name;
        });

    // Legend
    const legendDiv = document.createElement('div');
    legendDiv.className = 'map-legend';
    const minLabel = metric === 'count' ? '0' : 'U$S 0';
    const maxLabel = metric === 'count' ? fmt(maxVal) : 'U$S ' + fmt(maxVal);
    legendDiv.innerHTML = `<span>${minLabel}</span><div class="map-legend-bar" style="background:linear-gradient(to right,${colorScale.join(',')})"></div><span>${maxLabel}</span>`;
    container.appendChild(legendDiv);
}

// ===== Histograms =====
function renderHistograms() {
    renderHistogram('histPrecio', FILTERED.filter(r => r.precio > 0).map(r => r.precio),
        'Monto (USD)', v => 'U$S ' + fmt(v), C.green, generateBins([0, 100000, 500000, 1000000, 2000000, 5000000, 10000000, 20000000, 50000000, 200000000]));
    renderHistogram('histSuperficie', FILTERED.filter(r => r.superficie > 0).map(r => r.superficie),
        'Superficie (ha)', v => fmt(v) + ' ha', C.blue, generateBins([0, 50, 100, 250, 500, 1000, 2000, 5000, 10000, 30000]));
    renderHistogram('histPrecioHa', FILTERED.filter(r => r.pxHa && r.pxHa < 100000).map(r => r.pxHa),
        'Precio (USD/ha)', v => 'U$S ' + fmt(v), C.purple, generateBins([0, 500, 1000, 2000, 3000, 4000, 5000, 7500, 10000, 15000, 30000, 100000]));
}

function generateBins(edges) {
    return edges.slice(0, -1).map((e, i) => ({ min: e, max: edges[i + 1] }));
}

function renderHistogram(canvasId, values, xLabel, fmtFn, color, bins) {
    const counts = bins.map(b => values.filter(v => v >= b.min && v < b.max).length);
    const labels = bins.map(b => {
        if (b.max >= 100000000) return fmtFn(b.min) + '+';
        return fmtFn(b.min) + ' – ' + fmtFn(b.max);
    });

    if (CHARTS[canvasId]) CHARTS[canvasId].destroy();
    CHARTS[canvasId] = new Chart(document.getElementById(canvasId), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data: counts,
                backgroundColor: color + '88',
                borderColor: color,
                borderWidth: 1.5,
                borderRadius: 4,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1,
                    callbacks: { label: ctx => ` ${ctx.raw} ofrecimientos` }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45 } },
                y: {
                    beginAtZero: true, grid: { color: 'rgba(255,255,255,.04)', drawBorder: false },
                    ticks: { font: { size: 10 }, stepSize: undefined }
                }
            }
        }
    });
}

// ===== Scatter Plot =====
function renderScatter() {
    const pts = FILTERED.filter(r => r.pxHa && r.superficie > 0 && r.precio > 0 && r.pxHa < 100000)
        .map(r => ({ x: r.superficie, y: r.precio, depto: r.depto, pxha: r.pxHa }));

    if (CHARTS.scatter) CHARTS.scatter.destroy();
    CHARTS.scatter = new Chart(document.getElementById('scatterPlot'), {
        type: 'scatter',
        data: {
            datasets: [{
                data: pts,
                backgroundColor: C.cyan + '55',
                borderColor: C.cyan,
                borderWidth: 1,
                pointRadius: 4,
                pointHoverRadius: 7,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1,
                    callbacks: {
                        label: ctx => {
                            const p = ctx.raw;
                            return [` ${p.depto}`, ` ${fmt(p.x)} ha`, ` U$S ${fmt(p.y)}`, ` U$S ${fmt(p.pxha)}/ha`];
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'logarithmic', title: { display: true, text: 'Superficie (ha)', color: '#64748b' },
                    grid: { color: 'rgba(255,255,255,.04)' }, ticks: { font: { size: 10 }, callback: v => fmt(v) }
                },
                y: {
                    type: 'logarithmic', title: { display: true, text: 'Precio (USD)', color: '#64748b' },
                    grid: { color: 'rgba(255,255,255,.04)' }, ticks: { font: { size: 10 }, callback: v => 'U$S ' + fmt(v) }
                }
            }
        }
    });
}

// ===== Timeline =====
function movingAverage(arr, window) {
    return arr.map((_, i) => {
        const start = Math.max(0, i - window + 1);
        const slice = arr.slice(start, i + 1);
        return slice.reduce((a, b) => a + b, 0) / slice.length;
    });
}

function renderTimeline() {
    const mc = {}, mv = {};
    FILTERED.forEach(r => {
        if (!r.fecha) return;
        const k = r.fecha.getFullYear() + '-' + String(r.fecha.getMonth() + 1).padStart(2, '0');
        mc[k] = (mc[k] || 0) + 1;
        mv[k] = (mv[k] || 0) + r.precio;
    });
    const keys = Object.keys(mc).sort();
    const mNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const labels = keys.map(k => { const [y, m] = k.split('-'); return mNames[+m - 1] + ' ' + y; });
    const counts = keys.map(k => mc[k]);
    const values = keys.map(k => mv[k]);

    // 6-month moving averages
    const MA_WINDOW = 6;
    const countMA = movingAverage(counts, MA_WINDOW);
    const valueMA = movingAverage(values, MA_WINDOW);

    if (CHARTS.timeline) CHARTS.timeline.destroy();
    CHARTS.timeline = new Chart(document.getElementById('chartTimeline'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Ofrec. / mes', data: counts,
                    backgroundColor: C.blue + '44', borderColor: C.blue + '55',
                    borderWidth: 1, borderRadius: 2, borderSkipped: false,
                    yAxisID: 'y', order: 2
                },
                {
                    label: 'Media móvil 6m (cantidad)', data: countMA,
                    type: 'line', borderColor: C.cyan, backgroundColor: 'transparent',
                    borderWidth: 3, fill: false, tension: 0.4,
                    pointRadius: 0, pointHoverRadius: 5,
                    yAxisID: 'y', order: 1
                },
                {
                    label: 'Valor mensual (USD)', data: values,
                    type: 'line', borderColor: C.green + '44', backgroundColor: C.green + '08',
                    borderWidth: 1, fill: true, tension: 0.3,
                    pointRadius: 0, borderDash: [3, 3],
                    yAxisID: 'y1', order: 3
                },
                {
                    label: 'Media móvil 6m (valor)', data: valueMA,
                    type: 'line', borderColor: C.green, backgroundColor: C.green + '15',
                    borderWidth: 3, fill: true, tension: 0.4,
                    pointRadius: 0, pointHoverRadius: 5,
                    yAxisID: 'y1', order: 0
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { font: { size: 11 }, padding: 16 }
                },
                tooltip: {
                    backgroundColor: 'rgba(15,23,42,.95)', borderColor: '#334155', borderWidth: 1,
                    mode: 'index', intersect: false,
                    callbacks: {
                        label: ctx => {
                            const v = ctx.raw;
                            if (ctx.datasetIndex <= 1) return ` ${ctx.dataset.label}: ${fmt(v, 1)}`;
                            return ` ${ctx.dataset.label}: U$S ${fmt(v)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,.03)' },
                    ticks: { font: { size: 9 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 24 }
                },
                y: {
                    beginAtZero: true, position: 'left',
                    grid: { color: 'rgba(255,255,255,.04)' },
                    ticks: { font: { size: 10 } },
                    title: { display: true, text: 'Cantidad ofrecimientos', color: '#64748b', font: { size: 11 } }
                },
                y1: {
                    beginAtZero: true, position: 'right',
                    grid: { display: false },
                    ticks: { font: { size: 10 }, callback: v => 'U$S ' + fmt(v / 1000000, 1) + 'M' },
                    title: { display: true, text: 'Valor USD', color: '#64748b', font: { size: 11 } }
                }
            }
        }
    });
}

// ===== Bar Depto (Avg price/ha) =====
function renderBarDepto() {
    const stats = computeDeptoStats(FILTERED);
    const sorted = Object.entries(stats).filter(([, s]) => s.avgPxHa > 0).sort((a, b) => b[1].avgPxHa - a[1].avgPxHa);
    const labels = sorted.map(e => e[0]);
    const vals = sorted.map(e => Math.round(e[1].avgPxHa));

    if (CHARTS.barDepto) CHARTS.barDepto.destroy();
    CHARTS.barDepto = new Chart(document.getElementById('chartBarDepto'), {
        type: 'bar',
        data: {
            labels, datasets: [{
                data: vals,
                backgroundColor: vals.map((_, i) => `hsla(${200 + (i / Math.max(labels.length - 1, 1)) * 140}, 65%, 55%, 0.7)`),
                borderColor: vals.map((_, i) => `hsl(${200 + (i / Math.max(labels.length - 1, 1)) * 140}, 65%, 55%)`),
                borderWidth: 1.5, borderRadius: 5, borderSkipped: false
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, indexAxis: 'y',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1,
                    callbacks: { label: ctx => ` U$S ${fmt(ctx.raw)} / ha` }
                }
            },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { font: { size: 10 }, callback: v => 'U$S ' + fmt(v) } },
                y: { grid: { display: false }, ticks: { font: { size: 11, weight: '500' } } }
            }
        }
    });
}

// ===== Mini Doughnut Charts =====
function renderMiniCharts() {
    renderDoughnut('chartTipo', countBy(FILTERED, r => r.tipo || 'Otro'),
        [C.blue, C.purple, C.orange, C.cyan, C.pink]);
    renderDoughnut('chartNegocio', countBy(FILTERED, r => r.tipoNegocio || 'Otro'),
        [C.green, C.orange, C.purple, C.cyan, C.pink, C.yellow, C.slate]);
    const ocupColors = { 'Libre': C.green, 'Ocupado': C.red, 'Parcialmente ocupado': C.orange };
    const ocupData = countBy(FILTERED, r => r.estado || 'Sin datos');
    renderDoughnut('chartOcupacion', ocupData,
        Object.keys(ocupData).map(k => ocupColors[k] || C.slate));
}

function countBy(data, fn) {
    const counts = {};
    data.forEach(r => { const k = fn(r); counts[k] = (counts[k] || 0) + 1; });
    return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
}

function renderDoughnut(canvasId, data, colors) {
    const labels = Object.keys(data);
    const values = Object.values(data);
    if (CHARTS[canvasId]) CHARTS[canvasId].destroy();
    CHARTS[canvasId] = new Chart(document.getElementById(canvasId), {
        type: 'doughnut',
        data: {
            labels, datasets: [{
                data: values,
                backgroundColor: colors.slice(0, labels.length).map(c => c + 'cc'),
                borderColor: colors.slice(0, labels.length),
                borderWidth: 2, hoverOffset: 6
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '58%',
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 9 }, padding: 8, boxWidth: 10 } },
                tooltip: {
                    backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1,
                    callbacks: { label: ctx => { const pct = ((ctx.raw / FILTERED.length) * 100).toFixed(1); return ` ${ctx.label}: ${ctx.raw} (${pct}%)`; } }
                }
            }
        }
    });
}

// ===== Department Economics Table =====
function renderDeptoTable(data) {
    const stats = computeDeptoStats(data);
    let rows = Object.entries(stats).map(([name, s]) => ({ name, ...s }));

    // Sort
    const { col, asc } = SORT_STATE;
    rows.sort((a, b) => {
        let va = a[col], vb = b[col];
        if (typeof va === 'string') return asc ? va.localeCompare(vb) : vb.localeCompare(va);
        return asc ? va - vb : vb - va;
    });

    const tbody = document.getElementById('deptoTableBody');
    tbody.innerHTML = rows.map(r => `<tr>
        <td style="color:var(--text-primary);font-weight:600">${r.name}</td>
        <td class="num">${r.count}</td>
        <td class="num" style="color:var(--accent-green)">${fmt(r.totalVal)}</td>
        <td class="num">${fmt(r.totalHa)}</td>
        <td class="num" style="color:var(--accent-cyan);font-weight:700">${fmt(r.avgPxHa)}</td>
        <td class="num">${fmt(r.medPxHa)}</td>
        <td class="num">${fmt(r.minPxHa)}</td>
        <td class="num">${fmt(r.maxPxHa)}</td>
        <td class="num">${fmt(r.avgSize)}</td>
    </tr>`).join('');
}

// ===== Top Transactions Table =====
function renderTopTable() {
    const sorted = [...FILTERED].filter(r => r.precio > 0).sort((a, b) => b.precio - a.precio).slice(0, 20);
    const tbody = document.getElementById('topTableBody');
    tbody.innerHTML = sorted.map(r => {
        let ec = 'estado-otro', el = r.estado || '—';
        if (el === 'Libre') ec = 'estado-libre';
        else if (el === 'Ocupado') ec = 'estado-ocupado';
        else if (el.includes('Parcialmente')) ec = 'estado-parcial';
        return `<tr>
            <td style="color:var(--text-primary);font-weight:600">${r.expediente}</td>
            <td>${r.fechaStr}</td>
            <td>${r.tipo}</td>
            <td style="color:var(--text-primary)">${r.depto}</td>
            <td class="num">${fmt(r.superficie, 1)}</td>
            <td class="num" style="color:var(--accent-green);font-weight:600">${fmt(r.precio)}</td>
            <td class="num">${r.pxHa ? fmt(r.pxHa) : '—'}</td>
            <td><span class="estado-badge ${ec}">${el}</span></td>
        </tr>`;
    }).join('');
}

// ===== Tab Navigation =====
function bindTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            if (tabId === ACTIVE_TAB) return;
            ACTIVE_TAB = tabId;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(tc => tc.classList.add('hidden'));
            document.getElementById(tabId).classList.remove('hidden');
            // Re-render increment charts when switching to that tab (canvas size fix)
            if (tabId === 'tabIncremento') {
                setTimeout(() => renderIncremento(), 50);
            }
        });
    });
    // Window slider
    const slider = document.getElementById('incWindowRange');
    const label = document.getElementById('incWindowLabel');
    slider.addEventListener('input', () => {
        const v = +slider.value;
        label.textContent = v === 1 ? '1 año' : v + ' años';
    });
    slider.addEventListener('change', () => {
        renderIncremento();
    });
    // Bind increment table sorting
    document.querySelectorAll('#incrementoTable th.sortable-inc').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.sort;
            if (INC_SORT_STATE.col === col) INC_SORT_STATE.asc = !INC_SORT_STATE.asc;
            else { INC_SORT_STATE.col = col; INC_SORT_STATE.asc = col === 'name'; }
            document.querySelectorAll('#incrementoTable th.sortable-inc').forEach(h => {
                h.classList.remove('active-sort-inc');
                h.textContent = h.textContent.replace(/ [▲▼]/g, '');
            });
            th.classList.add('active-sort-inc');
            th.textContent += INC_SORT_STATE.asc ? ' ▲' : ' ▼';
            renderIncremento();
        });
    });
}

// ===== Incremento de Precios =====
function computePriceIncrement(data, windowYears) {
    // Group by department and year, compute avg price/ha
    const deptYearMap = {}; // { dept: { year: { sum, count } } }
    const activeDepto = getActiveDeptoFilter();

    data.forEach(r => {
        if (!r.fecha || !r.pxHa || r.pxHa >= 100000) return;
        const year = r.fecha.getFullYear();
        const deptosToCount = activeDepto
            ? r.departamentos.filter(d => d === activeDepto)
            : r.departamentos;
        deptosToCount.forEach(d => {
            if (!deptYearMap[d]) deptYearMap[d] = {};
            if (!deptYearMap[d][year]) deptYearMap[d][year] = { sum: 0, count: 0, txCount: 0 };
            deptYearMap[d][year].sum += r.pxHa;
            deptYearMap[d][year].count++;
            deptYearMap[d][year].txCount++;
        });
    });

    // Get available years across all depts
    const allYears = new Set();
    Object.values(deptYearMap).forEach(ym => Object.keys(ym).forEach(y => allYears.add(+y)));
    const sortedYears = [...allYears].sort((a, b) => a - b);
    if (sortedYears.length < 2) return { stats: [], years: sortedYears, deptYearAvg: {} };

    const endYear = sortedYears[sortedYears.length - 1];
    const startYear = Math.max(sortedYears[0], endYear - (windowYears - 1));
    const filteredYears = sortedYears.filter(y => y >= startYear && y <= endYear);

    // Compute avg per dept per year
    const deptYearAvg = {};
    const stats = [];

    for (const [dept, yearData] of Object.entries(deptYearMap)) {
        deptYearAvg[dept] = {};
        let totalTx = 0;
        filteredYears.forEach(y => {
            if (yearData[y]) {
                deptYearAvg[dept][y] = yearData[y].sum / yearData[y].count;
                totalTx += yearData[y].txCount;
            }
        });

        // Find first/last year with data in the window
        const deptWindowYears = filteredYears.filter(y => deptYearAvg[dept][y] != null);
        if (deptWindowYears.length < 2) continue;

        const firstYear = deptWindowYears[0];
        const lastYear = deptWindowYears[deptWindowYears.length - 1];
        const startPrice = deptYearAvg[dept][firstYear];
        const endPrice = deptYearAvg[dept][lastYear];
        const absChange = endPrice - startPrice;
        const pctChange = startPrice > 0 ? (absChange / startPrice) * 100 : 0;

        stats.push({
            name: dept,
            startYear: firstYear,
            endYear: lastYear,
            startPrice,
            endPrice,
            absChange,
            pctChange,
            txCount: totalTx
        });
    }

    return { stats, years: filteredYears, deptYearAvg };
}

function renderIncremento() {
    const windowVal = +(document.getElementById('incWindowRange').value) || 5;
    const { stats, years, deptYearAvg } = computePriceIncrement(FILTERED, windowVal);
    renderIncrementoKPIs(stats, years);
    renderIncrementoMap(stats);
    renderIncrementoBarChart(stats);
    renderIncrementoTrend(deptYearAvg, years);
    renderIncrementoTable(stats);
}

function renderIncrementoKPIs(stats, years) {
    if (!stats.length || !years.length) {
        document.getElementById('kpiMaxIncDepto').textContent = '—';
        document.getElementById('kpiMaxIncPct').textContent = '';
        document.getElementById('kpiMinIncDepto').textContent = '—';
        document.getElementById('kpiMinIncPct').textContent = '';
        document.getElementById('kpiAvgIncPct').textContent = '—';
        document.getElementById('kpiIncPeriodo').textContent = '—';
        return;
    }

    const sorted = [...stats].sort((a, b) => b.pctChange - a.pctChange);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const avgPct = stats.reduce((s, r) => s + r.pctChange, 0) / stats.length;

    document.getElementById('kpiMaxIncDepto').textContent = best.name;
    document.getElementById('kpiMaxIncPct').textContent = (best.pctChange >= 0 ? '+' : '') + fmt(best.pctChange, 1) + '%';
    document.getElementById('kpiMaxIncPct').style.color = best.pctChange >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';

    document.getElementById('kpiMinIncDepto').textContent = worst.name;
    document.getElementById('kpiMinIncPct').textContent = (worst.pctChange >= 0 ? '+' : '') + fmt(worst.pctChange, 1) + '%';
    document.getElementById('kpiMinIncPct').style.color = worst.pctChange >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';

    document.getElementById('kpiAvgIncPct').textContent = (avgPct >= 0 ? '+' : '') + fmt(avgPct, 1) + '%';
    document.getElementById('kpiAvgIncPct').style.color = avgPct >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';

    document.getElementById('kpiIncPeriodo').textContent = years[0] + '–' + years[years.length - 1];
}

function renderIncrementoMap(stats) {
    if (!GEO_DATA || !stats.length) {
        document.getElementById('mapIncremento').innerHTML = '<p style="color:var(--text-muted);text-align:center">Datos insuficientes</p>';
        return;
    }

    const container = document.getElementById('mapIncremento');
    container.innerHTML = '';
    const w = container.clientWidth || 500;
    const h = container.clientHeight - 30 || 380;

    const svg = d3.select('#mapIncremento').append('svg')
        .attr('viewBox', `0 0 ${w} ${h}`)
        .attr('preserveAspectRatio', 'xMidYMid meet');

    const projection = d3.geoMercator().fitSize([w - 20, h - 40], GEO_DATA);
    const pathGen = d3.geoPath().projection(projection);

    // Build stats lookup
    const lookup = {};
    stats.forEach(s => { lookup[s.name] = s; });

    const pctValues = stats.map(s => s.pctChange);
    const minPct = Math.min(...pctValues, 0);
    const maxPct = Math.max(...pctValues, 1);

    // Red -> Yellow -> Green scale
    const colorScale = d3.scaleLinear()
        .domain([minPct, 0, maxPct])
        .range(['#ef4444', '#fbbf24', '#22c55e'])
        .clamp(true);

    const tooltip = document.getElementById('mapTooltip');

    svg.selectAll('path')
        .data(GEO_DATA.features)
        .enter().append('path')
        .attr('d', pathGen)
        .attr('class', 'dept-path')
        .attr('fill', d => {
            const s = lookup[d.properties.NAME_1];
            return s ? colorScale(s.pctChange) : '#1a2235';
        })
        .on('mouseenter', (event, d) => {
            const name = d.properties.NAME_1;
            const s = lookup[name];
            tooltip.style.display = 'block';
            tooltip.innerHTML = `<div class="tt-name">${name}</div>` +
                (s ? `<div class="tt-row"><span>Precio inicio</span><span class="tt-val">U$S ${fmt(s.startPrice, 0)}/ha</span></div>
                      <div class="tt-row"><span>Precio final</span><span class="tt-val">U$S ${fmt(s.endPrice, 0)}/ha</span></div>
                      <div class="tt-row"><span>Cambio</span><span class="tt-val" style="color:${s.pctChange >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}">${s.pctChange >= 0 ? '+' : ''}${fmt(s.pctChange, 1)}%</span></div>
                      <div class="tt-row"><span>Transacciones</span><span class="tt-val">${s.txCount}</span></div>`
                    : '<div class="tt-row"><span>Sin datos</span></div>');
        })
        .on('mousemove', event => {
            tooltip.style.left = (event.clientX + 14) + 'px';
            tooltip.style.top = (event.clientY - 10) + 'px';
        })
        .on('mouseleave', () => { tooltip.style.display = 'none'; });

    // Department labels with % change
    svg.selectAll('text')
        .data(GEO_DATA.features)
        .enter().append('text')
        .attr('x', d => pathGen.centroid(d)[0])
        .attr('y', d => pathGen.centroid(d)[1])
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('fill', '#fff')
        .attr('font-size', '8px')
        .attr('font-weight', '700')
        .attr('pointer-events', 'none')
        .text(d => {
            const s = lookup[d.properties.NAME_1];
            if (!s) return '';
            return (s.pctChange >= 0 ? '+' : '') + fmt(s.pctChange, 0) + '%';
        });

    // Legend
    const legendDiv = document.createElement('div');
    legendDiv.className = 'map-legend';
    legendDiv.innerHTML = `<span>${fmt(minPct, 0)}%</span><div class="map-legend-bar" style="background:linear-gradient(to right,#ef4444,#fbbf24,#22c55e)"></div><span>+${fmt(maxPct, 0)}%</span>`;
    container.appendChild(legendDiv);
}

function renderIncrementoBarChart(stats) {
    if (!stats.length) return;

    const sorted = [...stats].sort((a, b) => b.pctChange - a.pctChange);
    const labels = sorted.map(s => s.name);
    const vals = sorted.map(s => Math.round(s.pctChange * 10) / 10);
    const colors = vals.map(v => v >= 0 ? 'rgba(52, 211, 153, 0.7)' : 'rgba(248, 113, 113, 0.7)');
    const borderColors = vals.map(v => v >= 0 ? '#34d399' : '#f87171');

    if (CHARTS.incBar) CHARTS.incBar.destroy();
    CHARTS.incBar = new Chart(document.getElementById('chartIncrementoBar'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data: vals,
                backgroundColor: colors,
                borderColor: borderColors,
                borderWidth: 1.5,
                borderRadius: 5,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, indexAxis: 'y',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1,
                    callbacks: { label: ctx => ` ${ctx.raw >= 0 ? '+' : ''}${ctx.raw}%` }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,.04)' },
                    ticks: { font: { size: 10 }, callback: v => v + '%' }
                },
                y: { grid: { display: false }, ticks: { font: { size: 11, weight: '500' } } }
            }
        }
    });
}

function renderIncrementoTrend(deptYearAvg, years) {
    if (!years.length) return;

    const depts = Object.keys(deptYearAvg).sort();
    const datasets = depts.map((dept, i) => {
        const hue = (i / Math.max(depts.length - 1, 1)) * 340;
        return {
            label: dept,
            data: years.map(y => deptYearAvg[dept][y] != null ? Math.round(deptYearAvg[dept][y]) : null),
            borderColor: `hsl(${hue}, 65%, 55%)`,
            backgroundColor: `hsla(${hue}, 65%, 55%, 0.1)`,
            borderWidth: 2.5,
            fill: false,
            tension: 0.3,
            pointRadius: 4,
            pointHoverRadius: 7,
            spanGaps: true
        };
    });

    if (CHARTS.incTrend) CHARTS.incTrend.destroy();
    CHARTS.incTrend = new Chart(document.getElementById('chartIncrementoTrend'), {
        type: 'line',
        data: { labels: years.map(String), datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { font: { size: 10 }, padding: 12, boxWidth: 10, usePointStyle: true }
                },
                tooltip: {
                    backgroundColor: 'rgba(15,23,42,.95)', borderColor: '#334155', borderWidth: 1,
                    mode: 'index', intersect: false,
                    callbacks: {
                        label: ctx => ctx.raw != null ? ` ${ctx.dataset.label}: U$S ${fmt(ctx.raw)}/ha` : null
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,.04)' },
                    ticks: { font: { size: 11, weight: '500' } }
                },
                y: {
                    beginAtZero: false,
                    grid: { color: 'rgba(255,255,255,.04)' },
                    ticks: { font: { size: 10 }, callback: v => 'U$S ' + fmt(v) },
                    title: { display: true, text: 'USD / ha', color: '#64748b', font: { size: 11 } }
                }
            }
        }
    });
}

function renderIncrementoTable(stats) {
    if (!stats.length) {
        document.getElementById('incrementoTableBody').innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">Sin datos para el período</td></tr>';
        return;
    }

    let rows = [...stats];
    const { col, asc } = INC_SORT_STATE;
    rows.sort((a, b) => {
        let va = a[col], vb = b[col];
        if (typeof va === 'string') return asc ? va.localeCompare(vb) : vb.localeCompare(va);
        return asc ? va - vb : vb - va;
    });

    const tbody = document.getElementById('incrementoTableBody');
    tbody.innerHTML = rows.map(r => {
        const isPos = r.pctChange >= 0;
        const cls = isPos ? 'increment-positive' : 'increment-negative';
        const badgeCls = isPos ? 'up' : 'down';
        const arrow = isPos ? '▲' : '▼';
        return `<tr>
            <td style="color:var(--text-primary);font-weight:600">${r.name}</td>
            <td class="num">U$S ${fmt(r.startPrice, 0)}</td>
            <td class="num" style="font-weight:600">U$S ${fmt(r.endPrice, 0)}</td>
            <td class="num ${cls}">${isPos ? '+' : ''}${fmt(r.absChange, 0)}</td>
            <td class="num"><span class="increment-badge ${badgeCls}">${arrow} ${isPos ? '+' : ''}${fmt(r.pctChange, 1)}%</span></td>
            <td class="num">${r.txCount}</td>
        </tr>`;
    }).join('');
}
