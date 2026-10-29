// Convierte la hoja "Concentrado de vuelos" en los datos del buscador.
// Descarta teléfono, correo, fecha de nacimiento y costos.
(function (root) {
  const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();
  const up = v => clean(v).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const pad = n => String(n).padStart(2, '0');
  const empty = v => { const s = clean(v); return !s || s === '-' || s === '0'; };
  function toDate(v) {
    if (v instanceof Date) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
    if (typeof v === 'number') { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 864e5); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
    const s = clean(v); const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${pad(m[2])}-${pad(m[1])}`;
    return s;
  }
  function toTime(v) {
    if (typeof v === 'number') { const mins = Math.round((v - Math.floor(v)) * 1440); return `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`; }
    const s = clean(v); const m = s.match(/^(\d{1,2}):?(\d{2})/);
    return m ? `${pad(m[1])}:${m[2]}` : '';
  }
  const GROUPS = [['c1', 'CONEXION I'], ['ida', 'DESTINO IDA'], ['reg', 'DESTINO REGRESO'], ['c2', 'CONEXION II'], ['res', 'DATOS DE LA RESERVA'], ['end', 'CARGOS']];

  function parse(grid, opt) { opt = opt || {};
    const hi = grid.findIndex(r => r && r.some(c => up(c) === 'NOMBRE'));
    if (hi < 1) throw new Error('No encontré la columna "Nombre" en la hoja de vuelos.');
    const H = grid[hi].map(up), G = grid[hi - 1].map(up);
    const start = {};
    GROUPS.forEach(([k, label]) => {
      const i = G.findIndex(c => c && (label === 'CONEXION I' ? /CONEXION I$/.test(c) : c.includes(label)));
      if (i >= 0) start[k] = i;
    });
    if (start.ida == null || start.reg == null) throw new Error('No encontré los bloques "DESTINO IDA" y "DESTINO REGRESO".');
    const bounds = Object.values(start).concat(H.length).sort((a, b) => a - b);
    const range = k => { const s = start[k]; if (s == null) return null; return [s, bounds.find(b => b > s)]; };
    function cols(k) {
      const r = range(k); if (!r) return null; const m = {};
      for (let i = r[0]; i < r[1]; i++) { const h = H[i]; if (h) m[h] = i; } // última aparición gana
      return m;
    }
    const C = { c1: cols('c1'), ida: cols('ida'), reg: cols('reg'), c2: cols('c2'), res: cols('res') };
    const col = n => H.indexOf(n);
    const iName = col('NOMBRE'), iSt = col('ESTATUS'), iRegion = col('REGION');
    const iRol = H.findIndex(h => h.startsWith('ROL'));
    // Indicaciones especiales: solo columna R (TRASLADO DE SU CIUDAD) y columna S (PERNOCTA ...).
    const iTr = H.findIndex(h => h.startsWith('TRASLADO DE SU CIUDAD')), iPe = H.findIndex(h => h.startsWith('PERNOCTA'));
    const MESES = {ENE:0, FEB:1, MAR:2, ABR:3, MAY:4, JUN:5, JUL:6, AGO:7, SEP:8, OCT:9, NOV:10, DIC:11};
    const MES_TXT = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    const fecha = t => { const m = up(t).match(/\b(\d{1,2})\s*(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)[A-Z]*\b/); if (!m) return '';
      const d = new Date(Date.UTC(2026, MESES[m[2]], +m[1])); return `${DIAS[d.getUTCDay()]} ${+m[1]} de ${MES_TXT[MESES[m[2]]]}`; };
    const fechas = t => { const r = [], re = /\b(\d{1,2})\s*(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)[A-Z]*\b/g; let m; while ((m = re.exec(up(t)))) r.push(fecha(m[0])); return r; };
    const isoFechas = t => { const r = [], re = /\b(\d{1,2})\s*(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)[A-Z]*\b/g; let m; while ((m = re.exec(up(t)))) r.push(`2026-${pad(MESES[m[2]] + 1)}-${pad(m[1])}`); return r; };
    const hora = t => { const m = up(t).match(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/); if (!m) { const h = up(t).match(/A LAS (\d{1,2}):(\d{2})/); return h ? `${pad(h[1])}:${h[2]} h` : ''; }
      let h = +m[1] % 12; if (m[3] === 'PM') h += 12; return `${pad(h)}:${m[2] || '00'} h`; };
    // Puntos de encuentro conocidos, escritos de forma clara.
    const PUNTOS = [[/METEPEC/i, 'Plaza Metepec (Towns Square), Av. Ignacio Comonfort 1100, Residencial la Providencia, Metepec, Estado de México'],
                    [/TRIANGULO/i, 'Centro Comercial El Triángulo (en la bahía), Circuito Juan Pablo II #3515, Local L1-A, Puebla, Pue.']];
    const lugar = (t, conPernocta) => { const u = up(t); if (/SAN CARLOS/.test(u)) return 'la sede del evento en San Carlos, Sonora';
      if (/HOTEL NH/.test(u)) return 'el Hotel NH Collection Mexico City Airport T2' + (conPernocta ? ', donde tienes tu hospedaje' : '');
      const h = clean(t).match(/Hotel [^,.]*/i); return h ? 'el ' + h[0].replace(/^hotel/i, 'Hotel').replace(/\s+donde.*$/i, '') : ''; };
    const CIUDAD = {MEX:'la Ciudad de México', GDL:'Guadalajara', MTY:'Monterrey', QRO:'Querétaro', PBC:'Puebla', TLC:'Toluca', MID:'Mérida', CUL:'Culiacán', LMM:'Los Mochis', ACA:'Acapulco', HMO:'Hermosillo'};
    const fechaIso = f => { const d = new Date(f + 'T12:00:00Z'); return isNaN(d) ? '' : `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MES_TXT[d.getUTCMonth()]}`; };
    function nota(k, raw, conPernocta, x) {
      const t = clean(raw), u = up(raw);
      if (!t || /^(-+|0+|N\/?A|NA|NO APLICA|NINGUNO|X+)$/i.test(t.replace(/[.\s]/g, ''))) return '';
      if (k === 'pe') {
        if (/HOTEL NH/.test(u)) { const [ci, co] = fechas(t);
          return `Hospedaje a tu llegada en el Hotel NH Collection Mexico City Airport T2, conectado a la Terminal 2 del aeropuerto de la Ciudad de México${ci ? `: check-in el ${ci}` : ''}${co ? ` y check-out el ${co}` : ''}.`; }
        return friendly(raw, true);
      }
      // k === 'tr'
      if (/SOLO .*REGRESO/.test(u)) { const v = x && (x.c2 || x.reg);
        return v ? `Traslado terrestre solo a tu regreso: el ${fechaIso(v.f)}, al aterrizar en ${CIUDAD[v.d] || v.d} en el vuelo ${v.v} (llegada ${v.l} h), te espera tu traslado terrestre.` : 'Traslado terrestre solo a tu regreso.'; }
      if (/LLEGA POR SU CUENTA/.test(u)) return `Llegas por tu cuenta a la sede del evento${/ESTACIONAMIENTO/.test(u) ? '; tienes estacionamiento considerado' : ''}.`;
      const f = fecha(t), h = hora(t), dest = lugar(t, conPernocta) || (conPernocta ? 'el Hotel NH Collection Mexico City Airport T2, donde tienes tu hospedaje' : '');
      const cuando = [f && `el ${f}`, h && `a las ${h}`].filter(Boolean).join(' ');
      if (/PUNTO DE ENCUENTRO/.test(u)) { const p = PUNTOS.find(([re]) => re.test(u)); const punto = p ? p[1] : friendly(t.split(/punto de encuentro,?/i)[1].split(/,?\s*su regreso/i)[0], true).replace(/\.$/, '');
        return `Traslado terrestre: ${cuando ? cuando + ' ' : ''}te recogemos en el punto de encuentro ${punto}${dest ? ','+'' : ''}${dest ? ` para llevarte ${dest.replace(/^el /, 'al ').replace(/^la /, 'a la ')}` : ''}. A tu regreso, el traslado te deja en el mismo punto de encuentro.`; }
      if (/DESDE (EL )?AEROPUERTO/.test(u)) return `Traslado terrestre: ${cuando ? cuando + ' ' : ''}te recogemos en el aeropuerto de ${CIUDAD[Object.keys(CITY).filter(c => c !== 'MEXICO' && u.includes('AEROPUERTO DE ' + c)).map(c => CITY[c])[0]] || 'Hermosillo'}${dest ? ` para llevarte ${dest.replace(/^el /, 'al ').replace(/^la /, 'a la ')}` : ''}. ${/FINALIZAR/.test(u) ? 'Al terminar el evento' : 'A tu regreso'}, el traslado te lleva de vuelta al mismo aeropuerto.`; // sin ciudad escrita = aeropuerto de Hermosillo (llegada del evento)
      if (/DOMICILIO/.test(u)) return `Traslado terrestre: ${cuando ? cuando + ' ' : ''}te recogemos en tu domicilio registrado${dest ? ` para llevarte ${dest.replace(/^el /, 'al ').replace(/^la /, 'a la ')}` : ''}. ${/FINALIZAR/.test(u) ? 'Al terminar el evento' : 'A tu regreso'}, el traslado te lleva de vuelta a la misma dirección.`;
      return friendly(raw, true);
    }
    // Texto aprobado para el traslado Tijuana → Ensenada (columna L).
    const SEG_BASE = 'A su llegada a Tijuana se le va a desplazar al Hotel Lucerna Tijuana para que desayunen y a las 12:00 hrs será el traslado al Hotel Torre Lucerna Ensenada';
    const segTxt = s => SEG_BASE + (/DESPLAZO DE \d/i.test(s) ? ' (trayecto de 1 h 30 min).' : '.'); // el trayecto solo si el Excel lo indica
    // Texto amigable: minúsculas con nombres propios corregidos; quita domicilios particulares.
    const KEEP = {TIJUANA:'Tijuana', ENSENADA:'Ensenada', LUCERNA:'Lucerna', HOTEL:'Hotel', TORRE:'Torre', CUPON:'cupón', METLIFE:'MetLife', SERA:'será', TOLUCA:'Toluca', MEXICO:'México'};
    const friendly = (s, quitarDomicilio) => {
      let t = clean(s);
      if (!t || /^(-+|0+|N\/?A|NA|NO APLICA|NINGUNO|X+)$/i.test(t.replace(/[.\s]/g, ''))) return ''; // vacíos: Na., 0., N/A, -
      t = t.replace(/\bY S ASU\b/gi, 'Y A SU').replace(/\bASU\b/gi, 'A SU');
      if (quitarDomicilio) t = t.replace(/\s*DESPLAZO\b(?!\s+DE\s+\d).*$/i, ' al domicilio registrado'); // no publica direcciones particulares
      t = t.split(' ').map(w => { const u = w.replace(/[.,]/g,'').toUpperCase(); const p = w.match(/[.,]+$/); const k = KEEP[u];
        if (k) return k + (p ? p[0] : ''); return /[a-záéíóúñ]/.test(w) ? w : w.toLowerCase(); }).join(' ');
      t = t.replace(/\b(\d{1,2})\s*hrs\b/gi, '$1:00 h').replace(/desplazo de (\d+):(\d+) minutos/i, '(trayecto de $1 h $2 min)').replace(/\bel desplazo a\b/i, 'el traslado a')
           .replace(/Hotel (Torre Lucerna) Hotel (Ensenada)/, 'Hotel $1 $2').replace(/\b(\d{1,2})(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\b/gi, '$1 $2').replace(/ Al /g, ' al ').replace(/\s+/g, ' ').trim();
      return t.charAt(0).toUpperCase() + t.slice(1) + (/[.)]$/.test(t) ? '' : '.');
    };
    // Ciudades escritas con nombre → código de aeropuerto.
    const CITY = {ACAPULCO:'ACA', MEXICO:'MEX', 'CIUDAD DE MEXICO':'MEX', CDMX:'MEX', HERMOSILLO:'HMO', GUADALAJARA:'GDL', MERIDA:'MID', MONTERREY:'MTY', QUERETARO:'QRO', QUETERARO:'QRO',
      CULIACAN:'CUL', TIJUANA:'TIJ', 'LOS MOCHIS':'LMM', TOLUCA:'TLC', PUEBLA:'PBC', CANCUN:'CUN', 'LOS CABOS':'SJD', AIFA:'NLU', MAZATLAN:'MZT', CHIHUAHUA:'CUU', LEON:'BJX', OAXACA:'OAX', VERACRUZ:'VER', VILLAHERMOSA:'VSA', 'SAN LUIS POTOSI':'SLP', AGUASCALIENTES:'AGU', MORELIA:'MLM', TORREON:'TRC', 'CIUDAD JUAREZ':'CJS', TAMPICO:'TAM', 'PUERTO VALLARTA':'PVR', 'LA PAZ':'LAP', 'CIUDAD OBREGON':'CEN', GUAYMAS:'GYM'};
    const ap = v => { const u = up(v ?? ''); return CITY[u] || u; };
    const leg = (r, m) => {
      if (!m || empty(r[m['VUELO']])) return null;
      return { v: clean(r[m['VUELO']]).toUpperCase().replace(/VIVAAEROBUS/g, 'VIVA AEROBUS').replace(/\s+/g, ' ').replace(/^AM (?=\d)/, 'AEROMEXICO ').replace(/^Y4 (?=\d)/, 'VOLARIS ').replace(/^VB (?=\d)/, 'VIVA AEROBUS '), f: toDate(r[m['FECHA']]), o: ap(r[m['ORIGEN']]), d: ap(r[m['DESTINO']]),
               s: toTime(r[m['SALE']]), l: toTime(r[m['LLEGA']]) };
    };
    const rows = [];
    for (const r of grid.slice(hi + 1)) {
      if (!r || empty(r[iName])) continue;
      const res = C.res || {};
      // Reserva de ida (RESERVA LLEGADA / RESERVA IDA) y de regreso (RESERVA REGRESO).
      // Reportes anteriores traen una sola columna RESERVA AEROLINEA: se usa para ambos tramos.
      const rk = Object.keys(res);
      const idaKey = rk.find(k => /^(RESERVA|CLAVE DE AEROLINEA) (LLEGADA|IDA)/.test(k));
      const regKey = rk.find(k => /^(RESERVA|CLAVE DE AEROLINEA) (REGRESO|VUELTA|SALIDA)/.test(k));
      const unaKey = rk.find(k => /^RESERVA AEROLINEA/.test(k));
      const code = k => k && !empty(r[res[k]]) && !/^X+$/i.test(clean(r[res[k]])) ? clean(r[res[k]]).toUpperCase() : ''; // XXXXXX = clave aún no asignada
      const x = { n: up(r[iName]).replace(/AEROMEXICO/g, 'AM'), // corrige reemplazo accidental de AM -> AEROMEXICO en nombres
                 st: clean(r[iSt]).toUpperCase(), rol: iRol >= 0 ? clean(r[iRol]) : '', rg: iRegion >= 0 && !empty(r[iRegion]) ? up(r[iRegion]) : '',
        c1: leg(r, C.c1), ida: leg(r, C.ida), reg: leg(r, C.reg), c2: leg(r, C.c2),
        ci: idaKey ? code(idaKey) : code(unaKey), cr: regKey ? code(regKey) : code(unaKey) };
      let pe = iPe >= 0 ? nota('pe', r[iPe]) : '';
      // Sin pernocta si su primer vuelo sale de su ciudad el mismo día del check-out (o después): ese día vuela directo, no duerme en el hotel.
      const prim = leg(r, C.c1) || leg(r, C.ida), co = pe ? isoFechas(r[iPe])[1] : '';
      if (pe && prim && co && prim.o && prim.o !== 'MEX' && prim.f >= co) pe = '';
      x.notas = [iTr >= 0 && (t => t && { k: 'tr', t })(nota('tr', r[iTr], !!pe, x)), pe && { k: 'pe', t: pe }].filter(Boolean);
      if (!x.notas.length) delete x.notas;
      if (!x.cr && x.ci && x.reg) x.cr = x.ci; // sin reserva de regreso: es la misma clave de la ida
      x.cl = x.ci || x.cr; // compatibilidad con páginas guardadas en el navegador
      if (x.c1 && x.ida && !x.ida.o) x.ida.o = x.c1.d;
      if (x.c2 && x.reg && !x.c2.o) x.c2.o = x.reg.d;
      if (/^STAFF/i.test(x.rol)) { if (!opt.staff) continue; x.staff = true; } // staff: solo si se pide (va aparte, protegido con la contraseña VECI)
      rows.push(x);
    }
    return rows;
  }
  // Las claves no se publican: se guarda solo una huella PBKDF2 para poder buscar por clave exacta.
  const SALT = 'vuelos-ip-summit-v1', ITER = 150000;
  const normKey = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  async function keyHash(code) {
    const enc = new TextEncoder(), c = root.crypto.subtle;
    const k = await c.importKey('raw', enc.encode(normKey(code)), 'PBKDF2', false, ['deriveBits']);
    const bits = await c.deriveBits({ name: 'PBKDF2', salt: enc.encode(SALT), iterations: ITER, hash: 'SHA-256' }, k, 128);
    return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  async function protect(rows) {
    for (const r of rows) {
      const codes = new Set();
      [r.ci, r.cr].filter(Boolean).forEach(c => { codes.add(normKey(c)); c.split(/[^A-Z0-9]+/i).forEach(p => p.length >= 5 && codes.add(normKey(p))); });
      r.k = [];
      for (const c of codes) r.k.push(await keyHash(c));
      r.kc = r.ci ? 1 : 0; r.kp = r.cr ? 1 : 0;
      delete r.ci; delete r.cr;
    }
    return rows;
  }
  root.parseConcentrado = parse;
  root.protectClaves = protect;
  root.claveHash = keyHash;
  root.normClave = normKey;
  if (typeof module !== 'undefined') module.exports = { parse, protect, keyHash, normKey };
})(typeof window !== 'undefined' ? window : globalThis);
