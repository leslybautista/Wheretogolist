/* ──────────────────────────────────────────────────────────────────────
   WhereToGo · List view · App
   Two-pane layout:
     LEFT — full grid of rich destination cards
     RIGHT — sticky Europe map (geographic context) + Advanced sheet
   Cards open a detail modal on click. Hovering a card highlights its
   dot on the map (and vice-versa). Cards omit the train row when no
   train data is available.
   ────────────────────────────────────────────────────────────────────── */

(function(){

const { ORIGINS, CITIES, PRESETS } = window.WF;

/* ────────── STATE ────────── */
const STATE = {
  originKey:  "VIE",
  month:      6,
  presetId:   "balanced",
  weights:    { time:.25, cost:.25, co2:.25, pop:.25 },
  popInvert:  false,
  entryDone:  false,
  active:     null,
  hovered:    null,
};

/* ────────── STUDY INTERACTION LOGGING ────────── */
/* logEvent / hoverStart / hoverEnd are defined by logger.js (loaded first).   */
/* logger.js writes to wtg_log_A / wtg_log_B keyed by ?c= URL param.          */
/* ────────────────────────────────────────────────── */

const MONTHS = [
  ["Jan","January"],["Feb","February"],["Mar","March"],["Apr","April"],
  ["May","May"],["Jun","June"],["Jul","July"],["Aug","August"],
  ["Sep","September"],["Oct","October"],["Nov","November"],["Dec","December"],
];

const INTEREST_ICON = { see:"👁", do:"🏃", eat:"🍽", drink:"🍸", sleep:"🛏", shop:"🛍" };

const MEDAL = {
  1:{ icon:"🏆", label:"Best match" },
  2:{ icon:"🥈", label:"Silver pick" },
  3:{ icon:"🥉", label:"Bronze pick" },
};

const ICONS = {
  train:  `<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="14" rx="3"/><line x1="5" y1="11" x2="19" y2="11"/><circle cx="9" cy="14" r="1" fill="currentColor"/><circle cx="15" cy="14" r="1" fill="currentColor"/><line x1="7" y1="20" x2="9" y2="17"/><line x1="17" y1="20" x2="15" y2="17"/></svg>`,
  flight: `<svg viewBox="0 0 24 24"><path d="M21 12c0-.7-.4-1.2-1-1.4l-7-2.4V3.5c0-.8-.7-1.5-1.5-1.5S10 2.7 10 3.5v4.7L3 10.6c-.6.2-1 .8-1 1.4 0 .5.4 1 1 1l7-1v4.6l-2 1.4v1l3-.6 3 .6v-1l-2-1.4V12l7 1c.6 0 1-.5 1-1z" fill="currentColor" stroke="none"/></svg>`,
};

const TRANSPORT_ICON_LG = {
  train:  `<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="14" rx="3"/><line x1="5" y1="11" x2="19" y2="11"/><circle cx="9" cy="14" r="1" fill="currentColor"/><circle cx="15" cy="14" r="1" fill="currentColor"/><line x1="7" y1="20" x2="9" y2="17"/><line x1="17" y1="20" x2="15" y2="17"/></svg>`,
  flight: `<svg viewBox="0 0 24 24"><path d="M21 12c0-.7-.4-1.2-1-1.4l-7-2.4V3.5c0-.8-.7-1.5-1.5-1.5S10 2.7 10 3.5v4.7L3 10.6c-.6.2-1 .8-1 1.4 0 .5.4 1 1 1l7-1v4.6l-2 1.4v1l3-.6 3 .6v-1l-2-1.4V12l7 1c.6 0 1-.5 1-1z" fill="currentColor" stroke="none"/></svg>`,
};

/* ────────── HELPERS ────────── */
const svgNS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs){
  const el = document.createElementNS(svgNS, tag);
  if(attrs) Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));
  return el;
}
const toRad = d => d * Math.PI / 180;
const toDeg = r => r * 180 / Math.PI;

function bearing(lat1,lon1,lat2,lon2){
  const φ1=toRad(lat1),φ2=toRad(lat2),Δλ=toRad(lon2-lon1);
  const y=Math.sin(Δλ)*Math.cos(φ2);
  const x=Math.cos(φ1)*Math.sin(φ2)-Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
  return (toDeg(Math.atan2(y,x))+360)%360;
}
function bearingLabel(b){
  return ["N","NE","E","SE","S","SW","W","NW"][Math.round(b/45)%8];
}
function distanceKm(lat1,lon1,lat2,lon2){
  const R = 6371;
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const dφ = toRad(lat2-lat1), dλ = toRad(lon2-lon1);
  const a = Math.sin(dφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2;
  return 2*R*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function normalize(arr,key,inverse=false){
  const vals=arr.map(d=>d[key]);
  const mn=Math.min(...vals), mx=Math.max(...vals);
  arr.forEach(d=>{
    const n=(d[key]-mn)/(mx-mn||1);
    d["n_"+key]= inverse ? 1-n : n;
  });
}
const BAD_PHOTOS = new Set(["1583000186270-d3b0fec0d2c8"]);
function photoURL(id, w=480){
  if(!id || BAD_PHOTOS.has(id)) return null;
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=70`;
}
function fallbackPhotoURL(seed, w=480){
  const s = encodeURIComponent(String(seed || "city").toLowerCase());
  return `https://picsum.photos/seed/${s}/${w}/${Math.round(w*0.9)}`;
}
function fmtTime(t){
  const hh = Math.floor(t);
  const mm = Math.round((t-hh)*60);
  return mm > 0 ? `${hh}h ${mm}m` : `${hh}h`;
}
function currentMonthKey(){
  if (STATE.month == null || !Array.isArray(WF.MONTHS_LIST) || !WF.MONTHS_LIST.length) return null;
  const mm = String(STATE.month + 1).padStart(2, "0");
  return WF.MONTHS_LIST.find(m => m.endsWith("-" + mm)) || null;
}
function pickBestMode(train, flight, weights){
  if(!train)  return false;
  if(!flight) return true;
  const tTime = train.time,  fTime = flight.time;
  const tCost = train.cost,  fCost = flight.cost;
  const tCo2  = train.co2  ?? 9999, fCo2 = flight.co2 ?? 9999;
  const timeRange = Math.abs(fTime - tTime) || 1;
  const costRange = Math.abs(fCost - tCost) || 1;
  const co2Range  = Math.abs(fCo2  - tCo2 ) || 1;
  const scoreOf = (t, c, e) =>
    weights.time * (t - Math.min(tTime, fTime)) / timeRange +
    weights.cost * (c - Math.min(tCost, fCost)) / costRange +
    weights.co2  * (e - Math.min(tCo2,  fCo2 )) / co2Range;
  return scoreOf(tTime, tCost, tCo2) <= scoreOf(fTime, fCost, fCo2);
}

/* ────────── COMPUTE ────────── */
function compute(){
  const O = ORIGINS[STATE.originKey];
  const popInverse = !!STATE.popInvert;
  const mk = currentMonthKey();
  const monthly = (WF.MONTHLY && mk) ? (WF.MONTHLY[STATE.originKey] || null) : null;

  const data = CITIES
    .filter(c => c.name !== O.name)
    .map(c => {
      const cell = monthly && c.iata ? (monthly[c.iata] || {})[mk] : null;
      if (cell && cell.available) {
        const preferTrain = pickBestMode(cell.train, cell.flight, STATE.weights);
        const chosen = preferTrain ? cell.train : cell.flight;
        return {
          ...c,
          time: chosen.time, cost: chosen.cost,
          co2: chosen.co2 ?? c.co2Flight,
          transport: preferTrain ? "train" : "flight",
          hasFlight: !!cell.flight,
          hasTrain:  !!cell.train,
          flightInfo: cell.flight || null,
          trainInfo:  cell.train  || null,
          bearingDeg: bearing(O.lat, O.lon, c.lat, c.lon),
          distanceKm: Math.round(distanceKm(O.lat, O.lon, c.lat, c.lon)),
          _cell: cell,
        };
      }
      return null;
    })
    .filter(Boolean);

  normalize(data,"time");
  normalize(data,"cost");
  normalize(data,"co2");
  normalize(data,"pop", !popInverse);

  const w = STATE.weights;
  data.forEach(d=>{
    d.score = w.time*d.n_time + w.cost*d.n_cost + w.co2*d.n_co2 + w.pop*d.n_pop;
  });
  data.sort((a,b)=>a.score-b.score);
  data.forEach((d,i)=>d.rank=i+1);

  const sMin=data[0].score, sMax=data[data.length-1].score;
  data.forEach(d=>{
    d.scoreNorm = (d.score-sMin)/(sMax-sMin||1);
    d.matchPct  = Math.round((1-d.scoreNorm)*100);
  });
  return data;
}

/* ────────── DOM refs ────────── */
let listEl, rankCountEl, rankPresetEl, rankRouteEl, bestNameEl, bestPctEl;
let sideLandEl, sideDotsEl, sideHitsEl, sideGratEl, sideMapEl, sideMapHintEl;
let presetTrayEl;
let lastData = [];

function captureRefs(){
  listEl       = document.getElementById("rank-list");
  rankCountEl  = document.getElementById("rank-count");
  rankPresetEl = document.getElementById("rank-preset");
  rankRouteEl  = document.getElementById("rank-route");
  bestNameEl   = document.getElementById("best-name");
  bestPctEl    = document.getElementById("best-pct");
  sideLandEl   = document.getElementById("side-land");
  sideDotsEl   = document.getElementById("side-dots");
  sideHitsEl   = document.getElementById("side-hits");
  sideGratEl   = document.getElementById("side-grat");
  sideMapEl    = document.querySelector(".wf-side-map");
  sideMapHintEl= document.getElementById("side-map-hint");
  presetTrayEl  = document.getElementById("preset-tray");
}

/* ────────── TOP CHROME ────────── */
function drawOriginSelect(){
  const sel = document.getElementById("origin-select");
  sel.innerHTML = "";
  Object.entries(ORIGINS).forEach(([k,v])=>{
    const o = document.createElement("option");
    o.value = k;
    o.textContent = v.name;
    sel.appendChild(o);
  });
  sel.value = STATE.originKey;
  sel.addEventListener("change", ()=>{
    STATE.originKey = sel.value;
    STATE.active = null;
    STATE.hovered = null;
    drawSideMap(); // re-orient projection origin
    render();
  });
}
function drawMonthSelect(){
  const sel = document.getElementById("month-select");
  sel.innerHTML = "";
  MONTHS.forEach(([, full], i)=>{
    const o = document.createElement("option");
    o.value = i;
    o.textContent = full;
    sel.appendChild(o);
  });
  sel.value = STATE.month;
  sel.addEventListener("change", ()=>{
    STATE.month = parseInt(sel.value, 10);
    render();
  });
}
function drawPresetTray(){
  const tray = document.getElementById("preset-tray");
  tray.innerHTML = "";
  PRESETS.forEach(p=>{
    const b = document.createElement("button");
    b.className = "wf-preset" + (p.id === STATE.presetId ? " is-active" : "");
    b.textContent = p.label;
    b.title = p.hint;
    b.addEventListener("click", ()=>{
      STATE.presetId = p.id;
      STATE.weights = { ...p.w };
      STATE.popInvert = !!p.popInvert;
      syncAdvancedFromState();
      drawPresetTray();
      render();
    });
    tray.appendChild(b);
  });
}

/* ────────── ADVANCED SHEET ────────── */
function syncAdvancedFromState(){
  document.querySelectorAll('#sheet input[data-w]').forEach(el=>{
    const k = el.getAttribute("data-w");
    const v = Math.round((STATE.weights[k] || 0) * 100);
    el.value = v;
    const out = document.querySelector(`#sheet [data-vw="${k}"]`);
    if(out) out.textContent = v + "%";
  });
  const inv = document.getElementById("pop-invert");
  if(inv) inv.checked = !!STATE.popInvert;
}
function readAdvanced(){
  const vals = {}; let sum = 0;
  document.querySelectorAll('#sheet input[data-w]').forEach(el=>{
    const k = el.getAttribute("data-w");
    vals[k] = parseInt(el.value, 10) || 0;
    sum += vals[k];
  });
  if(sum === 0) sum = 1;
  Object.keys(vals).forEach(k=>{
    STATE.weights[k] = vals[k] / sum;
    const out = document.querySelector(`#sheet [data-vw="${k}"]`);
    if(out) out.textContent = vals[k] + "%";
  });
  STATE.popInvert = document.getElementById("pop-invert").checked;
   STATE.presetId = "custom";
  if(presetTrayEl) presetTrayEl.querySelectorAll(".wf-preset").forEach(b=>b.classList.remove("is-active"));
  window.logEvent?.("WEIGHT_CHANGE", {
    time: Math.round(STATE.weights.time*100),
    cost: Math.round(STATE.weights.cost*100),
    co2:  Math.round(STATE.weights.co2*100),
    pop:  Math.round(STATE.weights.pop*100)
  });
}
function wireAdvanced(){
  const btn   = document.getElementById("btn-advanced");
  const sheet = document.getElementById("sheet");
  const close = document.getElementById("sheet-close");
  const open  = ()=> { sheet.classList.add("is-open"); btn.classList.add("is-on"); syncAdvancedFromState(); };
  const shut  = ()=> { sheet.classList.remove("is-open"); btn.classList.remove("is-on"); };
  btn.addEventListener("click", (e)=>{
    e.stopPropagation();
    sheet.classList.contains("is-open") ? shut() : open();
  });
  close.addEventListener("click", shut);
  document.querySelectorAll('#sheet input[data-w]').forEach(el=>{
    el.addEventListener("input", ()=>{ readAdvanced(); render(); });
  });
  document.getElementById("pop-invert").addEventListener("change", ()=>{ readAdvanced(); render(); });
  document.addEventListener("click", (e)=>{
    if(!sheet.classList.contains("is-open")) return;
    if(sheet.contains(e.target)) return;
    if(e.target.closest("#btn-advanced")) return;
    shut();
  });
  document.addEventListener("keydown", e=>{ if(e.key==="Escape") shut(); });
}

/* ────────── ENTRY SCREEN ────────── */
function drawEntry(){
  const oSel = document.getElementById("entry-origin");
  oSel.innerHTML = "";
  Object.entries(ORIGINS).forEach(([k,v])=>{
    const o = document.createElement("option");
    o.value = k; o.textContent = v.name;
    oSel.appendChild(o);
  });
  oSel.value = STATE.originKey;

  const mSel = document.getElementById("entry-month");
  mSel.value = String(STATE.month + 1);

  const vibesEl = document.getElementById("entry-vibes");
  vibesEl.innerHTML = "";
  PRESETS.forEach(p=>{
    const b = document.createElement("button");
    b.type = "button";
    b.className = "wf-vibe" + (p.id === STATE.presetId ? " is-active" : "");
    b.innerHTML = `
      <div class="wf-vibe-tick"></div>
      <div class="wf-vibe-name">${p.label}</div>
      <div class="wf-vibe-hint">${p.hint}</div>
    `;
    b.addEventListener("click", ()=>{
      STATE.presetId = p.id;
      STATE.weights = { ...p.w };
      STATE.popInvert = !!p.popInvert;
      vibesEl.querySelectorAll(".wf-vibe").forEach(el=>el.classList.remove("is-active"));
      b.classList.add("is-active");
      updateEntrySummary();
    });
    vibesEl.appendChild(b);
  });

  oSel.addEventListener("change", ()=>{ STATE.originKey = oSel.value; updateEntrySummary(); });
  mSel.addEventListener("change", ()=>{
    const v = parseInt(mSel.value, 10);
    if(!isNaN(v)) STATE.month = v - 1;
    updateEntrySummary();
  });

  document.getElementById("entry-cta").addEventListener("click", finishEntry);
  updateEntrySummary();
}
function updateEntrySummary(){
  const o = ORIGINS[STATE.originKey];
  const m = MONTHS[STATE.month];
  const p = PRESETS.find(x=>x.id===STATE.presetId);
  document.getElementById("entry-summary").textContent =
    `${o ? "From " + o.name.toUpperCase() : "—"} · ${m ? m[1].toUpperCase() : "—"} · ${p ? p.label.toUpperCase() : "—"}`;
}
function finishEntry(){
  STATE.entryDone = true;
  document.getElementById("wf-entry").hidden = true;
  document.getElementById("wf-shell").hidden = false;
  bootApp();
}
function openEntry(){
  STATE.entryDone = false;
  document.getElementById("wf-entry").hidden = false;
  document.getElementById("wf-shell").hidden = true;
  drawEntry();
}

/* ──────────────────────────────────────────────────────────────────
   EUROPE SIDEBAR MAP — Mercator projection of europe.geojson
   ────────────────────────────────────────────────────────────────── */
const MAP = { W: 320, H: 360, latMin: 34, latMax: 71, lonMin: -25, lonMax: 32 };
function project(lat, lon){
  const x = (lon - MAP.lonMin) / (MAP.lonMax - MAP.lonMin) * MAP.W;
  const merc = l => Math.log(Math.tan(Math.PI / 4 + toRad(l) / 2));
  const yMin = merc(MAP.latMin);
  const yMax = merc(MAP.latMax);
  const y = (1 - (merc(lat) - yMin) / (yMax - yMin)) * MAP.H;
  return [x, y];
}
function geoJSONPath(coords){
  return coords.map(ring => {
    return ring.map(([lon, lat], i) => {
      const [x, y] = project(lat, lon);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ") + " Z";
  }).join(" ");
}

function drawSideMapLand(){
  if (!sideLandEl) return;
  sideLandEl.innerHTML = "";
  sideGratEl.innerHTML = "";

  // graticule
  for (let la = Math.ceil(MAP.latMin / 10) * 10; la <= MAP.latMax; la += 10) {
    const [, y1] = project(la, MAP.lonMin);
    sideGratEl.appendChild(svgEl("line", { x1: 0, y1, x2: MAP.W, y2: y1 }));
  }
  for (let lo = Math.ceil(MAP.lonMin / 10) * 10; lo <= MAP.lonMax; lo += 10) {
    const [x1] = project(MAP.latMin, lo);
    sideGratEl.appendChild(svgEl("line", { x1, y1: 0, x2: x1, y2: MAP.H }));
  }

  const geo = window.WF.EUROPE_GEOJSON;
  if (!geo || !geo.features) return;
  geo.features.forEach(f => {
    const geom = f.geometry;
    if (!geom) return;
    if (geom.type === "Polygon"){
      sideLandEl.appendChild(svgEl("path", { d: geoJSONPath(geom.coordinates) }));
    } else if (geom.type === "MultiPolygon"){
      geom.coordinates.forEach(poly => {
        sideLandEl.appendChild(svgEl("path", { d: geoJSONPath(poly) }));
      });
    }
  });
}

function drawSideMap(){
  if(!sideDotsEl) return;
  sideDotsEl.innerHTML = "";
  if(sideHitsEl) sideHitsEl.innerHTML = "";

  const O = ORIGINS[STATE.originKey];
  const [ox, oy] = project(O.lat, O.lon);
  sideDotsEl.appendChild(svgEl("circle", { cx: ox, cy: oy, r: 9, class: "wf-side-origin-ring" }));
  sideDotsEl.appendChild(svgEl("circle", { cx: ox, cy: oy, r: 5,  class: "wf-side-origin" }));

  const focusName = STATE.active || STATE.hovered;
  const data = lastData;
  data.forEach(d => {
    const [x, y] = project(d.lat, d.lon);
    const tier = d.rank <= 5 ? "top" : d.rank <= 12 ? "mid" : "low";
    const r    = tier === "top" ? 3.4 : tier === "mid" ? 2.6 : 2;
    const isFocus = focusName === d.name;
    const cls = `wf-side-dot tier-${tier}${isFocus ? " is-focus" : ""}`;
    sideDotsEl.appendChild(svgEl("circle", { cx: x, cy: y, r, class: cls }));
  });

  if(focusName){
    const fd = data.find(x => x.name === focusName);
    if(fd){
      const [fx, fy] = project(fd.lat, fd.lon);
      sideDotsEl.appendChild(svgEl("circle", { cx: fx, cy: fy, r: 8, class: "wf-side-focus-ring" }));
      // little label
      const lbl = svgEl("text", { x: fx + 10, y: fy + 4, class: "wf-side-label" });
      lbl.textContent = fd.name;
      // flip anchor if too close to right edge
      if(fx > MAP.W - 80){ lbl.setAttribute("text-anchor", "end"); lbl.setAttribute("x", fx - 10); }
      sideDotsEl.appendChild(lbl);
    }
  }

  // Hit targets
  if(!sideHitsEl) return;
  data.forEach(d => {
    const [x, y] = project(d.lat, d.lon);
    const hit = svgEl("circle", { cx: x, cy: y, r: 10, class: "wf-side-hit" });
    hit.addEventListener("mouseenter", () => onHover(d.name));
    hit.addEventListener("mouseleave", () => onHover(null));
    hit.addEventListener("click",     () => {
      window.logEvent?.("MAP_DOT_CLICK", { dest: d.name, rank: d.rank });
      scrollToCard(d.name);
    });
    sideHitsEl.appendChild(hit);
  });
}

/* ────────── HOVER / SELECT SYNC ────────── */
function onHover(name){
  if(STATE.hovered === name) return;
  if(STATE.hovered) window.hoverEnd?.(STATE.hovered);
  if(name)          window.hoverStart?.(name, "card");
  STATE.hovered = name;
  if(listEl){
    listEl.querySelectorAll(".wf-lcard").forEach(el=>{
      el.classList.toggle("is-hover", el.getAttribute("data-name") === name);
    });
  }
  if(sideMapEl){
    sideMapEl.classList.toggle("has-focus", !!(name || STATE.active));
    if(sideMapHintEl){
      const fn = name || STATE.active;
      sideMapHintEl.textContent = fn ? fn.toUpperCase() : "Hover a card to locate it";
    }
  }
  drawSideMap();
}

/* ────────── CARD RENDER ────────── */
function co2Class(co2){
  if(co2 == null) return "";
  if(co2 < 15) return "co2-low";
  if(co2 < 60) return "co2-mid";
  return "co2-high";
}
function popStars(pop){
  const n = Math.max(0, Math.min(5, Math.round((pop || 0) / 20)));
  return "★".repeat(n) + "☆".repeat(5 - n);
}
function modeHTML(mode, info, isBest){
  if(!info) return ""; // omit entirely if no data for this mode
  const co2  = info.co2 != null ? `${info.co2}kg` : "—";
  const cost = info.cost != null ? `€${info.cost}` : "—";
  return `<div class="wf-lcard-mode${isBest ? " is-best" : ""}">
    <div class="wf-lcard-mode-icon">${ICONS[mode]}</div>
    <div class="wf-lcard-mode-info">
      <div class="wf-lcard-mode-row">
        <span class="wf-lcard-mode-name">${mode}</span>
        ${isBest ? `<span class="wf-lcard-mode-best">✓ Smart pick</span>` : ""}
      </div>
      <div class="wf-lcard-mode-stats">
        <span>${fmtTime(info.time)}</span>
        <span>${cost}</span>
        <span class="co2">${co2}</span>
      </div>
    </div>
  </div>`;
}

function render(){
  if(!STATE.entryDone) return;

  const data = compute();
  lastData = data;
  const top = data.slice(0, 18);

  const o = ORIGINS[STATE.originKey];
  const m = MONTHS[STATE.month];
  const p = PRESETS.find(x=>x.id===STATE.presetId);
  rankCountEl.textContent  = top.length;
  rankPresetEl.textContent = p ? p.label.toLowerCase() : (STATE.presetId || "custom");
  rankRouteEl.textContent  = `${o.name} · ${m ? m[1] : "—"}`;
  const bestCountryEl  = document.getElementById("best-country");
  const bestMetricsEl  = document.getElementById("best-metrics");
  const bestInsightEl  = document.getElementById("best-insight");
  const bestMatchFill  = document.getElementById("best-match-fill");
  const bestMatchPctEl = document.getElementById("best-match-pct");

  if(top[0]){
    const d0 = top[0];
    bestNameEl.textContent = d0.name;
    bestPctEl.textContent  = d0.matchPct;
    if(bestCountryEl) bestCountryEl.textContent = d0.country || "";

    // Metric rows: weight bars + actual values
    if(bestMetricsEl){
      const W = STATE.weights;
      const wPct = {
        time: Math.round(W.time * 100),
        cost: Math.round(W.cost * 100),
        co2:  Math.round(W.co2  * 100),
        pop:  Math.round(W.pop  * 100),
      };
      const BLOCKS = 6;
      const blks = n => Array.from({length: BLOCKS}, (_, i) =>
        `<span class="wf-best-blk${i < n ? " on" : ""}"></span>`
      ).join("");
      const rows = [
        { label:"Time",  pct: wPct.time, val: fmtTime(d0.time) },
        { label:"Cost",  pct: wPct.cost, val: `€${d0.cost}` },
        { label:"CO₂",  pct: wPct.co2,  val: d0.co2 != null ? `${d0.co2} kg` : "—" },
        { label:"Pop",   pct: wPct.pop,  val: popStars(d0.pop) },
      ];
      bestMetricsEl.innerHTML = rows.map(r => {
        const filled = Math.round((r.pct / 100) * BLOCKS);
        return `<div class="wf-best-metric-row">
          <span class="wf-best-m-label">${r.label}</span>
          <div class="wf-best-bar">${blks(filled)}</div>
          <span class="wf-best-m-pct">${r.pct}%</span>
          <span class="wf-best-m-val">${r.val}</span>
        </div>`;
      }).join("");
    }

    if(bestInsightEl) bestInsightEl.textContent = d0.insight || "";
    if(bestMatchFill)  bestMatchFill.style.width  = d0.matchPct + "%";
    if(bestMatchPctEl) bestMatchPctEl.textContent = d0.matchPct + "%";
  } else {
    bestNameEl.textContent = "—";
    bestPctEl.textContent  = "—";
    if(bestCountryEl)  bestCountryEl.textContent  = "";
    if(bestMetricsEl)  bestMetricsEl.innerHTML     = "";
    if(bestInsightEl)  bestInsightEl.textContent   = "";
    if(bestMatchFill)  bestMatchFill.style.width   = "0%";
    if(bestMatchPctEl) bestMatchPctEl.textContent  = "—";
  }

  listEl.innerHTML = "";
  top.forEach((d, i)=>{
    const el = document.createElement("button");
    const rankCls = d.rank <= 3 ? ` is-rank-${d.rank}` : "";
    el.className = "wf-lcard" + (i === 0 ? " is-top" : "") + rankCls;
    el.type = "button";
    el.setAttribute("data-name", d.name);

    const primaryUrl  = d.photoUrl || photoURL(d.photoId, 480);
    const fallbackUrl = fallbackPhotoURL(d.iata || d.name, 480);
    const imgSrc = primaryUrl || fallbackUrl;

    const medal = MEDAL[d.rank];
    const medalLabel = medal ? medal.label : `Rank #${d.rank}`;

    const preferTrain = pickBestMode(d.trainInfo, d.flightInfo, STATE.weights);

    // Build modes row — omit the missing mode entirely
    const hasBoth = d.hasTrain && d.hasFlight;
    const modesInner = [
      d.hasTrain  ? modeHTML("train",  d.trainInfo,  preferTrain)            : "",
      d.hasFlight ? modeHTML("flight", d.flightInfo, !preferTrain && d.hasFlight) : "",
    ].join("");

    el.innerHTML = `
      <div class="wf-lcard-photo">
        <img src="${imgSrc}" data-fb="${fallbackUrl}" alt="" loading="lazy"
             onerror="if(this.dataset.fb && this.src!==this.dataset.fb){this.src=this.dataset.fb;}else{this.style.display='none';}">
        <span class="wf-lcard-medal" title="${medalLabel}" aria-label="${medalLabel}">${d.rank}</span>
        <div class="wf-lcard-photo-foot">
          <span class="wf-lcard-match">
            <span class="num">${d.matchPct}</span><span class="unit">%match</span>
          </span>
          ${d.iata ? `<span class="wf-lcard-iata">${d.iata}</span>` : ""}
        </div>
      </div>
      <div class="wf-lcard-body">
        <div class="wf-lcard-head">
          <h3 class="wf-lcard-name">${d.name}</h3>
          <div class="wf-lcard-sub">
            <span class="country">${d.country}</span>
            <span class="sep">·</span>
            <span>${d.distanceKm} km ${bearingLabel(d.bearingDeg)}</span>
            <span class="sep">·</span>
            <span class="pop-stars" title="Popularity">${popStars(d.pop)}</span>
          </div>
        </div>

        ${d.insight ? `<p class="wf-lcard-insight">${d.insight}</p>` : ""}

        <div class="wf-lcard-modes${hasBoth ? " has-both" : ""}">${modesInner}</div>

        <div class="wf-lcard-metrics">
          <div class="wf-lcard-m">
            <span class="wf-lcard-m-v">${fmtTime(d.time)}</span>
            <span class="wf-lcard-m-l">Travel</span>
          </div>
          <div class="wf-lcard-m">
            <span class="wf-lcard-m-v">€${d.cost}</span>
            <span class="wf-lcard-m-l">Fare</span>
          </div>
          <div class="wf-lcard-m">
            <span class="wf-lcard-m-v ${co2Class(d.co2)}">${d.co2}<u>kg</u></span>
            <span class="wf-lcard-m-l">CO₂</span>
          </div>
          <div class="wf-lcard-m">
            <span class="wf-lcard-m-v" style="text-transform:capitalize;">${d.transport}</span>
            <span class="wf-lcard-m-l">Mode</span>
          </div>
        </div>
      </div>
    `;
    el.addEventListener("mouseenter", ()=> onHover(d.name));
    el.addEventListener("mouseleave", ()=> onHover(null));
    el.addEventListener("click",      ()=> openDetail(d.name));
    listEl.appendChild(el);
  });

  drawSideMap();
}

/* ──────────────────────────────────────────────────────────────────
   DETAIL MODAL — ported from the original
   ────────────────────────────────────────────────────────────────── */
function emissionTag(co2){
  if(co2 == null) return { lab:"—",       cls:"is-neutral" };
  if(co2 < 15)    return { lab:"Pure",    cls:"is-pure"    };
  if(co2 < 60)    return { lab:"Moderate",cls:"is-neutral" };
  return                  { lab:"Heavy",  cls:"is-tight"   };
}
function popularityTag(pop){
  if(pop == null) return { lab:"—",       cls:"is-neutral" };
  if(pop >= 75)   return { lab:"Tight",   cls:"is-tight"   };
  if(pop >= 45)   return { lab:"Active",  cls:"is-neutral" };
  return                  { lab:"Serene", cls:"is-serene"  };
}
function seasonalityTag(d){
  if(!d.seasons || STATE.month == null) return { lab:"Open", cls:"is-neutral" };
  const ORDER = ["January","February","March","April","May","June",
                 "July","August","September","October","November","December"];
  const m = ORDER[STATE.month];
  if(!m) return { lab:"Open", cls:"is-neutral" };
  if(d.seasons.high   && d.seasons.high.includes(m))   return { lab:"Tight",  cls:"is-tight"   };
  if(d.seasons.medium && d.seasons.medium.includes(m)) return { lab:"Active", cls:"is-neutral" };
  if(d.seasons.low    && d.seasons.low.includes(m))    return { lab:"Serene", cls:"is-serene"  };
  return { lab:"Open", cls:"is-neutral" };
}
function modePillCo2(co2){
  if(co2 == null) return "";
  const cls = co2 < 15 ? "low" : co2 < 60 ? "mid" : "high";
  return `<span class="co2-dot ${cls}"></span>`;
}
function transportRowHTML(mode, info, isBest, isNA){
  const icon = TRANSPORT_ICON_LG[mode.toLowerCase()] || "";
  if(isNA){
    return `<div class="wf-transport-row is-na">
      <div class="wf-transport-icon">${icon}</div>
      <div class="wf-transport-main">
        <div class="wf-transport-co2">— CO₂e</div>
        <div class="wf-transport-mode">${mode}</div>
      </div>
      <div class="wf-transport-side">
        <div class="wf-transport-time">unavailable</div>
        <div class="wf-transport-cost">—</div>
      </div>
    </div>`;
  }
  const co2 = info.co2 ?? "?";
  const hh = Math.floor(info.time);
  const mm = Math.round((info.time - hh) * 60);
  const timeStr = `${hh} hr ${mm.toString().padStart(2,"0")} min`;
  const cost = info.cost!=null ? `€${info.cost}` : "—";
  return `<div class="wf-transport-row${isBest ? " is-best" : ""}">
    <div class="wf-transport-icon">${icon}</div>
    <div class="wf-transport-main">
      <div class="wf-transport-co2">${co2} kg CO₂e ${modePillCo2(info.co2)}</div>
      <div class="wf-transport-mode">${mode}</div>
    </div>
    <div class="wf-transport-side">
      <div class="wf-transport-time">${timeStr}</div>
      <div class="wf-transport-cost">${cost}</div>
    </div>
  </div>`;
}

function buildDetailModalBody(d, cell){
  const emis = emissionTag(d.co2);
  const popT = popularityTag(d.pop);
  const seas = seasonalityTag(d);

  const hasFlight = !!(cell && cell.flight);
  const hasTrain  = !!(cell && cell.train);
  const preferTrain = pickBestMode(
    hasTrain  ? cell.train  : null,
    hasFlight ? cell.flight : null,
    STATE.weights
  );

  const seasonStrip = (()=>{
    if(!d.seasons) return "";
    const SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const ORDER = ["January","February","March","April","May","June",
                   "July","August","September","October","November","December"];
    const highSet = new Set(d.seasons.high   || []);
    const medSet  = new Set(d.seasons.medium || []);
    const curIdx  = STATE.month;
    const pills = ORDER.map((m,i) => {
      const cls = highSet.has(m) ? "" : medSet.has(m) ? " is-med" : " is-low";
      const isCur = (curIdx === i) ? " is-current" : "";
      const tipText = highSet.has(m) ? "Peak season — high demand & prices" :
                      medSet.has(m)  ? "Shoulder season — good balance" :
                                       "Off-peak — quieter, cheaper";
      return `<span class="wf-detail-month${cls}${isCur}" title="${tipText}">${SHORT[i]}</span>`;
    }).join("");
    return `<div class="wf-detail-season">
      <div class="wf-detail-season-header">
        <div class="wf-detail-season-label">Best time to visit</div>
        <div class="wf-season-legend">
          <span class="wf-season-legend-dot is-high"></span><span>Peak</span>
          <span class="wf-season-legend-dot is-med"></span><span>Shoulder</span>
          <span class="wf-season-legend-dot is-low"></span><span>Off-peak</span>
        </div>
      </div>
      <div class="wf-detail-season-months">${pills}</div>
    </div>`;
  })();

  const interestsHTML = (()=>{
    if(!d.interests || !d.interests.length) return "";
    const MAX = 6;
    const shown = d.interests.slice(0, MAX);
    const extra = d.interests.length - MAX;
    const rows = shown.map(it => {
      const icon = INTEREST_ICON[it.type] || "📍";
      const safeTitle = (it.title||"").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      return `<div class="wf-detail-interest" title="${it.text ? it.text.replace(/"/g,"&quot;") : ""}"><span class="wf-detail-interest-icon">${icon}</span><span class="wf-detail-interest-title">${safeTitle}</span></div>`;
    }).join("");
    const moreRow = extra > 0 ? `<div class="wf-detail-more">+${extra} more highlights</div>` : "";
    return `<div>
      <div class="wf-detail-section-head">
        <h4 class="wf-detail-section-title">Highlights</h4>
        <div class="wf-detail-section-meta">curated from wikivoyage</div>
      </div>
      <div class="wf-detail-interests">${rows}${moreRow}</div>
    </div>`;
  })();

  let smartLabel = "—";
  let smartReason = `based on your current weights (CO₂ ${Math.round(STATE.weights.co2*100)}%)`;
  if(hasFlight || hasTrain){
    smartLabel = preferTrain ? "Train" : "Flight";
    if(hasFlight && hasTrain){
      const tr = cell.train, fl = cell.flight;
      const timeDiff = Math.abs(fl.time - tr.time);
      const costSave = fl.cost - tr.cost;
      if(preferTrain && costSave > 20 && timeDiff < 3)
        smartReason = `saves €${costSave} with only ${Math.round(timeDiff*60)} min extra`;
      else if(!preferTrain && fl.time < tr.time * 0.7)
        smartReason = `${Math.round((tr.time - fl.time)*60)} min faster`;
      else if(!preferTrain && fl.cost > tr.cost * 1.5)
        smartReason = `time weight (${Math.round(STATE.weights.time*100)}%) outweighs cost saving`;
    }
  }

  // Only include the unavailable row if completely missing — keeps detail
  // honest while the card itself stays compact.
  const transportRows = `
    ${hasTrain  ? transportRowHTML("Train",  cell.train,  preferTrain, false) : ""}
    ${hasFlight ? transportRowHTML("Flight", cell.flight, !preferTrain && hasFlight, false) : ""}
    ${!hasTrain  ? transportRowHTML("Train",  null, false, true) : ""}
    ${!hasFlight ? transportRowHTML("Flight", null, false, true) : ""}
  `;

  return `
    <p class="wf-detail-insight">${d.insight || ""}</p>

    <div class="wf-detail-badges">
      <div class="wf-detail-badge">
        <div class="wf-detail-badge-label">Emission impact</div>
        <div class="wf-detail-badge-pill ${emis.cls}"><span class="pip"></span>${emis.lab}</div>
      </div>
      <div class="wf-detail-badge">
        <div class="wf-detail-badge-label">Popularity</div>
        <div class="wf-detail-badge-pill ${popT.cls}"><span class="pip"></span>${popT.lab}</div>
      </div>
      <div class="wf-detail-badge">
        <div class="wf-detail-badge-label">Seasonality</div>
        <div class="wf-detail-badge-pill ${seas.cls}"><span class="pip"></span>${seas.lab}</div>
      </div>
    </div>

    <div>
      <div class="wf-detail-section-head">
        <h4 class="wf-detail-section-title">Compare transportation</h4>
        <div class="wf-detail-section-meta">${currentMonthKey() || "—"} · door-to-door</div>
      </div>
      <div class="wf-transport-list">${transportRows}</div>
    </div>

    <div class="wf-smart-choice">
      <span class="lightbulb">💡</span>
      <span>Smart choice <b>${smartLabel}</b> — ${smartReason}.</span>
    </div>

    ${seasonStrip}
    ${interestsHTML}
  `;
}

function scrollToCard(name){
  const card = listEl && listEl.querySelector(`.wf-lcard[data-name="${CSS.escape(name)}"]`);
  if(!card) return;

  const container = document.querySelector(".wf-list-main");
  if(container){
    const containerRect = container.getBoundingClientRect();
    const cardRect      = card.getBoundingClientRect();
    const targetTop     = container.scrollTop + (cardRect.top - containerRect.top) - 20;
    container.scrollTo({ top: targetTop, behavior: "smooth" });
  }

  card.classList.add("is-map-highlight");
  card.addEventListener("animationend", () => card.classList.remove("is-map-highlight"), { once: true });
  onHover(name);
}

function openDetail(name){
  const d = lastData.find(x=>x.name===name);
  if(!d) return;
  window.logEvent?.("CARD_DETAIL_OPEN", { dest: name, rank: d.rank, score: d.score });
  STATE.active = name;

  const overlay = document.getElementById("detail-overlay");
  const hero    = document.getElementById("detail-hero");
  const rankEl  = document.getElementById("detail-rank");
  const nameEl  = document.getElementById("detail-name");
  const countryEl = document.getElementById("detail-country");
  const subEl   = document.getElementById("detail-sub");
  const bodyEl  = document.getElementById("detail-body");
  if(!overlay) return;

  // Hero image
  hero.style.backgroundImage = "";
  let heroImg = hero.querySelector(".wf-detail-hero-img");
  if(!heroImg){
    heroImg = document.createElement("img");
    heroImg.className = "wf-detail-hero-img";
    heroImg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;display:block;";
    hero.insertBefore(heroImg, hero.firstChild);
  }
  const primary  = d.photoUrl || photoURL(d.photoId, 800);
  const fallback = fallbackPhotoURL(d.iata || d.name, 800);
  heroImg.src = primary || fallback;
  heroImg.style.display = "";
  heroImg.onerror = () => {
    if(heroImg.src !== fallback) heroImg.src = fallback;
    else heroImg.style.display = "none";
  };

  rankEl.className = "wf-detail-hero-rank" + (d.rank <= 3 ? ` is-medal-${d.rank}` : "");
  const medal = MEDAL[d.rank];
  rankEl.innerHTML = medal
    ? `<span style="font-size:14px;">${medal.icon}</span> #${d.rank} · ${medal.label}`
    : `#${d.rank} · ${d.matchPct}% match`;

  nameEl.firstChild.nodeValue = d.name;
  countryEl.textContent = ` ${d.country}`;
  subEl.textContent = `${d.matchPct}% composite match · ${currentMonthKey() || "—"}`;

  bodyEl.innerHTML = buildDetailModalBody(d, d._cell);

  overlay.classList.add("is-open");
  document.body.style.overflow = "hidden";

  // Highlight the dot on the map for the active selection
  drawSideMap();
}
function closeDetail(){
  window.logEvent?.("CARD_DETAIL_CLOSE", { dest: STATE.active || null });
  const overlay = document.getElementById("detail-overlay");
  if(!overlay) return;
  overlay.classList.remove("is-open");
  document.body.style.overflow = "";
  STATE.active = null;
  drawSideMap();
}
function wireDetail(){
  const overlay = document.getElementById("detail-overlay");
  const close   = document.getElementById("detail-close");
  if(!overlay || !close) return;
  close.addEventListener("click", closeDetail);
  overlay.addEventListener("click", (e)=>{ if(e.target === overlay) closeDetail(); });
  document.addEventListener("keydown", e=>{
    if(e.key === "Escape" && overlay.classList.contains("is-open")) closeDetail();
  });
}

/* ────────── BOOT ────────── */
let appBooted = false;
function bootApp(){
  captureRefs();
  if(!appBooted){
    appBooted = true;
    drawOriginSelect();
    drawMonthSelect();
    drawPresetTray();
    wireAdvanced();
    wireDetail();
    drawSideMapLand();
    const setupBtn = document.getElementById("btn-setup");
    if(setupBtn) setupBtn.addEventListener("click", openEntry);
  } else {
    const oSel = document.getElementById("origin-select"); if(oSel) oSel.value = STATE.originKey;
    const mSel = document.getElementById("month-select");  if(mSel) mSel.value = STATE.month;
    drawPresetTray();
  }
  render();
}

async function boot(){
  const loaderEl = document.getElementById("wf-loading");
  if(loaderEl) loaderEl.hidden = false;

  try {
    const tasks = [];
    if (typeof WF.loadDestinations    === "function") tasks.push(WF.loadDestinations());
    if (typeof WF.loadEuropeGeoJSON   === "function") tasks.push(WF.loadEuropeGeoJSON("europe.geojson"));
    await Promise.all(tasks);
  } catch (err) {
    console.warn("[WhereToGo] Could not load data files.", err);
  }
  if(loaderEl) loaderEl.hidden = true;

  drawEntry();
}

if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

})();
