// Sito del viaggio: sblocco con password, pagine a hash, spunte salvate sul dispositivo.
(function () {
  'use strict';

  var K = { chiave: 'g26:chiave', spunte: 'g26:spunte', musica: 'g26:musica', volume: 'g26:volume', foglie: 'g26:foglie', tema: 'g26:tema' };
  var FOGLIA = 'M-7.7,6.4 C-10.4,9.7 -18.9,8.4 -21.6,7.9 C-19.9,5.7 -14.2,-0.7 -20.0,1.0 C-21.6,1.9 -31.0,-5.5 -34.0,-8.5 C-30.0,-9.7 -18.2,-11.8 -16.8,-10.9 C-23.4,-15.2 -27.1,-30.1 -27.7,-35.5 C-22.6,-33.6 -9.1,-26.4 -6.5,-18.9 C-10.1,-29.3 -3.1,-44.9 0.0,-50.0 C3.1,-44.9 10.1,-29.3 6.5,-18.9 C9.1,-26.4 22.6,-33.6 27.7,-35.5 C27.1,-30.1 23.4,-15.2 16.8,-10.9 C18.2,-11.8 30.0,-9.7 34.0,-8.5 C31.0,-5.5 21.6,1.9 20.0,1.0 C14.2,-0.7 19.9,5.7 21.6,7.9 C18.9,8.4 10.4,9.7 7.7,6.4 Z';
  var GINKGO = 'M0,6 C-12,4 -25,-6 -28,-20 C-19,-28 -8,-28 -2,-22 L0,-13 L2,-22 C8,-28 19,-28 28,-20 C25,-6 12,4 0,6 Z';
  var GIORNI_SETT = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  var GRUPPI_LUOGHI = [['tokyo', 'Tokyo', '東京'], ['gite', 'Gite', '遠足'], ['kyoto', 'Kyoto', '京都']];

  var D = null, spunte = {}, ultimaRotta = null, curiositaIndice = -1;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var ls = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  // ── Cifratura ──
  function daB64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function aB64(buf) { var u = new Uint8Array(buf), s = ''; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); }
  function chiaveDaPassword(pw, pacchetto) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: daB64(pacchetto.sale), iterations: pacchetto.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
    });
  }
  function decifra(chiave, pacchetto) {
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: daB64(pacchetto.iv) }, chiave, daB64(pacchetto.dati)).then(function (buf) {
      return JSON.parse(new TextDecoder().decode(buf));
    });
  }

  // ── Date ──
  function parametro(nome) { var m = new RegExp('[?&]' + nome + '=([^&]+)').exec(location.search); return m ? decodeURIComponent(m[1]) : null; }
  function oggiJST() {
    var finto = parametro('oggi');
    if (finto) return finto;
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  }
  function oraJST() {
    var finta = parametro('ora');
    if (finta) return finta;
    try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()); }
    catch (e) { return '12:00'; }
  }
  function giorniTra(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }
  function settimana(data) { return GIORNI_SETT[new Date(data + 'T00:00:00Z').getUTCDay()]; }
  function minuti(ora) { var p = String(ora).split(':'); return (+p[0]) * 60 + (+p[1] || 0); }

  // ── Spunte ──
  function caricaSpunte() { try { spunte = JSON.parse(ls.get(K.spunte) || '{}') || {}; } catch (e) { spunte = {}; } }
  function salvaSpunte() { ls.set(K.spunte, JSON.stringify(spunte)); }
  function fatto(id, predefinito) { return Object.prototype.hasOwnProperty.call(spunte, id) ? spunte[id] === 1 : !!predefinito; }
  function imposta(id, v) { spunte[id] = v ? 1 : 0; salvaSpunte(); }
  function idVoce(lista, voce) { return lista.tipo === 'giornaliera' ? 'm:' + oggiJST() + ':' + voce.id : 'l:' + lista.id + ':' + voce.id; }
  function contaLista(lista) {
    var f = 0;
    lista.voci.forEach(function (v) { if (fatto(idVoce(lista, v), v.fatto)) f++; });
    return { fatte: f, totali: lista.voci.length };
  }
  function spunta(id, predefinito, etichetta) {
    return '<input type="checkbox" class="spunta" data-sp="' + esc(id) + '"' + (fatto(id, predefinito) ? ' checked' : '') + ' aria-label="' + esc(etichetta) + '">';
  }
  function voce(id, predefinito, titolo, dettagli, extra) {
    return '<li class="' + (fatto(id, predefinito) ? 'fatto' : '') + '"><label class="voce">' + spunta(id, predefinito, titolo) +
      '<span><span class="t">' + esc(titolo) + (extra || '') + '</span>' + (dettagli || []).map(function (d) { return '<span class="d">' + d + '</span>'; }).join('') + '</span></label></li>';
  }
  var PER = { entrambi: ['Tutti e due', 'per-entrambi'], sergio: ['Sergio', 'per-sergio'], davide: ['Vegano', 'per-davide'] };
  function extraCibo(f) {
    var p = PER[f.per] || PER.entrambi;
    return '<span class="jp">' + esc(f.jp) + '</span> <span class="chip-per ' + p[1] + '">' + p[0] + '</span>';
  }
  function dettagliCibo(f, conGiorno) {
    var d = [esc(f.desc), '<b>Dove:</b> ' + esc(f.dove) + (conGiorno && f.giorno ? ' · <a href="#giorno-' + f.giorno + '">' + f.giorno + ' novembre</a>' : '')];
    if (f.nota) d.push('<span class="nota-cibo">' + esc(f.nota) + '</span>');
    return d;
  }
  function maiuscola(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ── Pezzi di interfaccia ──
  function capo(occhiello, jp, titolo, testo) {
    return '<header class="capo"><p class="occhiello"><span class="jp">' + esc(jp) + '</span>' + esc(occhiello) + '</p><h1>' + esc(titolo) + '</h1>' + (testo ? '<p>' + esc(testo) + '</p>' : '') + '</header>';
  }
  function segmenti(voci, attiva) {
    return '<nav class="segmenti" aria-label="Sottosezioni">' + voci.map(function (v) {
      return '<a href="#' + v[0] + '"' + (v[0] === attiva ? ' aria-current="page"' : '') + '>' + esc(v[1]) + '</a>';
    }).join('') + '</nav>';
  }
  function barretta(f, t, colore) {
    var p = t ? Math.round(f / t * 100) : 0;
    return '<div class="progresso"><div class="barretta"' + (colore ? ' style="--c:' + colore + '"' : '') + '><i style="width:' + p + '%"></i></div><span>' + f + ' di ' + t + '</span></div>';
  }
  function anello(f, t) {
    var r = 19, c = 2 * Math.PI * r, p = t ? f / t : 0;
    return '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="' + r + '" fill="none" stroke="var(--linea)" stroke-width="5"/>' +
      '<circle cx="24" cy="24" r="' + r + '" fill="none" stroke="var(--momiji)" stroke-width="5" stroke-linecap="round" stroke-dasharray="' + (c * p).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 24 24)"/>' +
      '<text x="24" y="28" text-anchor="middle" font-size="12" font-weight="700" fill="var(--sumi)">' + Math.round(p * 100) + '%</text></svg>';
  }
  function chipCitta(g) {
    var c = D.citta[g.citta] || { nome: g.citta };
    return '<span class="chip c-' + esc(g.citta) + '"><span class="punto"></span>' + esc(c.nome) + '</span>';
  }
  function luogoPerId(id) { for (var i = 0; i < D.luoghi.length; i++) if (D.luoghi[i].id === id) return D.luoghi[i]; return null; }
  function ciboPerId(id) { for (var i = 0; i < D.cibo.length; i++) if (D.cibo[i].id === id) return D.cibo[i]; return null; }
  function giornoPerN(n) { for (var i = 0; i < D.giorni.length; i++) if (D.giorni[i].n === +n) return D.giorni[i]; return null; }
  function giornoDiOggi() { var o = oggiJST(); for (var i = 0; i < D.giorni.length; i++) if (D.giorni[i].data === o) return D.giorni[i]; return null; }
  function dataLunga(g) { return settimana(g.data) + ' ' + g.n + ' novembre'; }
  function contaProgramma(g) { var f = 0; g.programma.forEach(function (p, i) { if (fatto('g' + g.n + '-p' + i, p.fatto)) f++; }); return { fatte: f, totali: g.programma.length }; }
  function lista(id) { for (var i = 0; i < D.liste.length; i++) if (D.liste[i].id === id) return D.liste[i]; return null; }

  // ── Pagina Oggi ──
  function vistaOggi() {
    var oggi = oggiJST(), g = giornoDiOggi(), html = '';
    var prima = giorniTra(oggi, D.partenza), dopo = giorniTra(D.rientro, oggi);
    var stato;
    if (prima > 0) stato = '<p class="grande tab-num">' + prima + '</p><p class="stato">' + (prima === 1 ? 'giorno alla partenza' : 'giorni alla partenza') + '. Il volo parte da Fiumicino alle 15:10 del 4 novembre.</p>';
    else if (g) stato = '<p class="grande tab-num">' + (D.giorni.indexOf(g) + 1) + '<small style="font-size:18px;color:var(--cenere)"> / ' + D.giorni.length + '</small></p><p class="stato">Giorno ' + (D.giorni.indexOf(g) + 1) + ' del viaggio · ' + esc(dataLunga(g)) + ' · ' + esc(D.citta[g.citta].nome) + '</p>';
    else if (dopo > 0) stato = '<p class="grande">お帰り</p><p class="stato">Okaeri, bentornati a casa. Ecco tutto quello che avete visto e assaggiato.</p>';
    else stato = '<p class="stato">Buon viaggio!</p>';

    html += '<section class="card eroe"><div><p class="occhiello"><span class="jp">こんにちは</span>Konnichiwa</p><h1>' + esc(D.viaggiatori.join(' & ')) + '</h1>' + stato + '</div><img src="chibi.svg" alt="" width="400" height="380"></section>';

    if (g) {
      var ora = minuti(oraJST()), corrente = -1;
      g.programma.forEach(function (p, i) { if (minuti(p.ora) <= ora) corrente = i; });
      html += '<section class="card"><div class="card-capo"><h2>' + esc(g.titolo) + '</h2><span class="jp">' + esc(g.kanji) + '</span></div>' +
        (g.badge ? '<div class="chips" style="margin-bottom:12px">' + chipCitta(g) + g.badge.map(function (b) { return '<span class="chip">' + esc(b) + '</span>'; }).join('') + '</div>' : '') +
        '<ul class="oggi-lista">' + g.programma.map(function (p, i) {
          var cl = i < corrente ? 'passato' : i === corrente ? 'ora-ora' : '';
          return '<li class="' + cl + '"><span class="ora">' + esc(p.ora) + '</span><span>' + esc(p.titolo) + '</span></li>';
        }).join('') + '</ul><p style="margin-top:14px"><a class="btn piccolo" href="#giorno-' + g.n + '">Apri la giornata</a></p></section>';
      var dom = giornoPerN(g.n + 1);
      if (dom) html += '<a class="card giorno-card c-' + esc(dom.citta) + '" href="#giorno-' + dom.n + '"><div class="data"><b>' + dom.n + '</b><span>domani</span></div><div><h3>' + esc(dom.titolo) + '</h3><p>' + esc(dom.riassunto) + '</p></div><span class="kanji-sfondo">' + esc(dom.kanji) + '</span></a>';
    } else if (prima > 0) {
      // Tutte le liste pre-partenza insieme: progresso totale e le prime voci ancora aperte
      var pre = D.liste.filter(function (x) { return x.prePartenza || x.id === 'prima'; });
      var c = { fatte: 0, totali: 0 }, aperte = [];
      pre.forEach(function (l) {
        var cl = contaLista(l);
        c.fatte += cl.fatte; c.totali += cl.totali;
        l.voci.forEach(function (v) { if (!fatto(idVoce(l, v), v.fatto)) aperte.push([l, v]); });
      });
      html += '<section class="card"><div class="card-capo"><h2>Prima di partire</h2><span class="jp">準備</span></div>' + barretta(c.fatte, c.totali) +
        (aperte.length ? '<ul class="voci" style="margin-top:8px">' + aperte.slice(0, 6).map(function (x) { return voce(idVoce(x[0], x[1]), x[1].fatto, x[1].testo, x[1].dettaglio ? [esc(x[1].dettaglio)] : []); }).join('') + '</ul>' +
          (aperte.length > 6 ? '<p class="muto piccolo-testo" style="margin-top:6px">E altre ' + (aperte.length - 6) + ' cose nella pagina Liste.</p>' : '') : '<p class="muto" style="margin-top:8px">Tutto pronto. Si parte!</p>') +
        '<p style="margin-top:12px"><a class="btn piccolo chiaro" href="#liste">Tutta la checklist</a></p></section>';
      var primo = D.giorni[0];
      html += '<a class="card giorno-card c-' + esc(primo.citta) + '" href="#giorno-' + primo.n + '"><div class="data"><b>' + primo.n + '</b><span>nov</span></div><div><h3>' + esc(primo.titolo) + '</h3><p>' + esc(primo.riassunto) + '</p></div><span class="kanji-sfondo">' + esc(primo.kanji) + '</span></a>';
    }

    // Progressi
    var luoghiVisti = D.luoghi.filter(function (x) { return fatto('luogo-' + x.id); }).length;
    var ciboFatto = D.cibo.filter(function (x) { return fatto('cibo-' + x.id); }).length;
    var anelli = [
      ['bucket', 'Bucket list', contaLista(lista('esperienze'))],
      ['bucket', 'Foto con la R7', contaLista(lista('foto'))],
      ['bucket', 'Negozi nerd', contaLista(lista('nerd'))],
      ['mangiare', 'Assaggi', { fatte: ciboFatto, totali: D.cibo.length }],
      ['luoghi', 'Luoghi visti', { fatte: luoghiVisti, totali: D.luoghi.length }]
    ];
    html += '<section class="sezione-anelli"><h2 style="font-size:20px;margin:6px 0 10px">I vostri progressi</h2><div class="anelli">' + anelli.map(function (a) {
      return '<a class="anello" href="#' + a[0] + '">' + anello(a[2].fatte, a[2].totali) + '<span><b>' + esc(a[1]) + '</b><span>' + a[2].fatte + ' di ' + a[2].totali + '</span></span></a>';
    }).join('') + '</div></section>';

    // Curiosità
    if (curiositaIndice < 0) curiositaIndice = Math.floor(Math.random() * D.curiosita.length);
    html += '<section class="card"><div class="card-capo"><h2>Lo sapevi?</h2><span class="jp">豆知識</span></div><p class="curiosita">' + esc(D.curiosita[curiositaIndice]) + '</p>' +
      '<p style="margin-top:12px"><button class="btn piccolo chiaro" type="button" data-azione="curiosita">Un\'altra curiosità</button></p></section>';

    // Scorciatoie
    var tessere = [['itinerario', '旅', 'Itinerario'], ['luoghi', '名所', 'Luoghi'], ['mangiare', '食', 'Mangiare'], ['bucket', '夢', 'Bucket list'], ['liste', '準備', 'Checklist'], ['spostamenti', '駅', 'Spostamenti'], ['frasi', '話', 'Frasi'], ['prenotazioni', '予約', 'Prenotazioni']];
    html += '<nav class="tessere" aria-label="Tutte le pagine">' + tessere.map(function (t) { return '<a class="tessera" href="#' + t[0] + '"><span class="k">' + t[1] + '</span>' + esc(t[2]) + '</a>'; }).join('') + '</nav>';
    return html;
  }

  // ── Itinerario ──
  function vistaItinerario() {
    var oggi = oggiJST();
    var gruppi = [['Partenza', function (g) { return g.n === 4; }], ['Tokyo · 5-11 novembre', function (g) { return g.n >= 5 && g.n <= 11; }], ['Kyoto · 12-20 novembre', function (g) { return g.n >= 12 && g.n <= 20; }], ['Rientro', function (g) { return g.n === 21; }]];
    var html = capo('Itinerario', '旅程', 'Giorno per giorno', '18 giorni: sette notti a Tokyo, otto a Kyoto, cinque gite. Tocca un giorno per il programma completo e spunta le tappe man mano.');
    gruppi.forEach(function (gr) {
      var giorni = D.giorni.filter(gr[1]);
      html += '<section class="gruppo-giorni"><h2>' + esc(gr[0]) + '</h2>' + giorni.map(function (g) {
        var c = contaProgramma(g);
        return '<a class="card giorno-card c-' + esc(g.citta) + (g.data === oggi ? ' oggi' : '') + '" href="#giorno-' + g.n + '">' +
          '<div class="data"><b>' + g.n + '</b><span>' + esc(settimana(g.data).slice(0, 3)) + '</span></div>' +
          '<div><h3>' + esc(g.titolo) + '</h3><p>' + esc(g.riassunto) + '</p><div class="chips">' + chipCitta(g) +
          (g.cambiato ? '<span class="chip forte">Migliorato</span>' : '') +
          (g.badge || []).map(function (b) { return '<span class="chip">' + esc(b) + '</span>'; }).join('') + '</div>' +
          '<div class="barretta"><i style="width:' + (c.totali ? Math.round(c.fatte / c.totali * 100) : 0) + '%"></i></div></div>' +
          '<span class="kanji-sfondo">' + esc(g.kanji) + '</span></a>';
      }).join('') + '</section>';
    });
    return html;
  }

  function vistaGiorno(n) {
    var g = giornoPerN(n);
    if (!g) return vistaNonTrovata();
    var oggi = g.data === oggiJST(), ora = minuti(oraJST()), corrente = -1;
    if (oggi) g.programma.forEach(function (p, i) { if (minuti(p.ora) <= ora) corrente = i; });
    var c = contaProgramma(g);
    var html = '<a class="indietro" href="#itinerario">← Itinerario</a>';
    html += '<section class="giorno-testa c-' + esc(g.citta) + '"><span class="kanji-grande">' + esc(g.kanji) + '</span>' +
      capo(maiuscola(dataLunga(g)), D.citta[g.citta].jp, g.titolo, g.riassunto) +
      '<div class="chips" style="margin-top:10px">' + chipCitta(g) + (g.badge || []).map(function (b) { return '<span class="chip">' + esc(b) + '</span>'; }).join('') + '</div></section>';
    if (g.cambiato) html += '<p class="cambio"><b>Migliorato · </b>' + esc(g.cambiato) + '</p>';

    html += '<section class="card"><div class="card-capo"><h2>Il programma</h2><span class="jp">予定</span></div>' + barretta(c.fatte, c.totali) +
      '<ol class="linea-tempo" style="margin-top:10px">' + g.programma.map(function (p, i) {
        var id = 'g' + g.n + '-p' + i, l = p.luogo ? luogoPerId(p.luogo) : null;
        return '<li class="' + (fatto(id, p.fatto) ? 'fatto' : '') + '"' + (i === corrente ? ' style="background:var(--momiji-tenue);border-radius:12px"' : '') + '>' + spunta(id, p.fatto, p.titolo) +
          '<div><span class="ora">' + esc(p.ora) + (i === corrente ? ' · adesso' : '') + '</span><h3>' + esc(p.titolo) + '</h3>' + (p.testo ? '<p>' + esc(p.testo) + '</p>' : '') +
          (l ? '<a class="vai" href="#luogo-' + l.id + '">Scheda: ' + esc(l.nome) + ' →</a>' : '') + '</div></li>';
      }).join('') + '</ol></section>';

    if (g.muoversi && g.muoversi.length) html += '<section class="card c-' + esc(g.citta) + '"><div class="card-capo"><h2>Come muoversi</h2><span class="jp">交通</span></div><ul class="puntini">' + g.muoversi.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul></section>';

    if (g.luoghi && g.luoghi.length) html += '<section class="card"><div class="card-capo"><h2>I luoghi del giorno</h2><span class="jp">名所</span></div><div class="scorri">' + g.luoghi.map(function (id) {
      var l = luogoPerId(id); if (!l) return '';
      return '<a class="mini-luogo" href="#luogo-' + l.id + '"><span class="jp">' + esc(l.jp) + '</span><b>' + esc(l.nome) + (fatto('luogo-' + l.id) ? ' ✓' : '') + '</b><span>' + esc(l.tipo) + ' · ' + esc(l.area) + '</span></a>';
    }).join('') + '</div></section>';

    if (g.mangiare && g.mangiare.length) html += '<section class="card"><div class="card-capo"><h2>Da assaggiare</h2><span class="jp">食</span></div><ul class="voci cibo">' + g.mangiare.map(function (id) {
      var f = ciboPerId(id); if (!f) return '';
      return voce('cibo-' + f.id, false, f.nome, dettagliCibo(f, false), extraCibo(f));
    }).join('') + '</ul></section>';

    if (g.note && g.note.length) html += '<section class="card"><div class="card-capo"><h2>Da ricordare</h2><span class="jp">注意</span></div><ul class="puntini">' + g.note.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></section>';
    if (g.omiyage) html += '<section class="card"><div class="card-capo"><h2>Omiyage di oggi</h2><span class="jp">土産</span></div><p>' + esc(g.omiyage) + '</p><p style="margin-top:10px"><a href="' + esc(D.link[0].url) + '" target="_blank" rel="noopener">Apri il Piano omiyage →</a></p></section>';

    var prec = giornoPerN(g.n - 1), succ = giornoPerN(g.n + 1);
    html += '<nav class="navigiorni">' + (prec ? '<a href="#giorno-' + prec.n + '"><small>← ' + prec.n + ' novembre</small>' + esc(prec.titolo) + '</a>' : '<span></span>') +
      (succ ? '<a class="dx" href="#giorno-' + succ.n + '"><small>' + succ.n + ' novembre →</small>' + esc(succ.titolo) + '</a>' : '<span></span>') + '</nav>';
    return html;
  }

  // ── Luoghi ──
  function vistaLuoghi(gruppo) {
    gruppo = gruppo || 'tokyo';
    var tutti = D.luoghi.filter(function (l) { return l.gruppo === gruppo; });
    var visti = tutti.filter(function (l) { return fatto('luogo-' + l.id); }).length;
    var info = GRUPPI_LUOGHI.filter(function (x) { return x[0] === gruppo; })[0] || GRUPPI_LUOGHI[0];
    var html = capo('Luoghi', '名所', 'Da vedere', 'Templi, quartieri, giardini e negozi, con curiosità, consigli e orari. Spunta quelli che hai visto.');
    html += segmenti(GRUPPI_LUOGHI.map(function (x) {
      var n = D.luoghi.filter(function (l) { return l.gruppo === x[0]; }).length;
      return ['luoghi-' + x[0], x[1] + ' · ' + n];
    }), 'luoghi-' + gruppo);
    html += '<div class="card">' + barretta(visti, tutti.length) + '</div>';
    tutti.sort(function (a, b) { return (a.giorno || 99) - (b.giorno || 99); });
    html += '<div class="luoghi">' + tutti.map(function (l) {
      var id = 'luogo-' + l.id;
      return '<article class="card luogo-card"><a class="corpo" href="#luogo-' + l.id + '"><span class="jp">' + esc(l.jp) + '</span><h3>' + esc(l.nome) + '</h3>' +
        '<span class="meta">' + esc(l.tipo) + ' · ' + esc(l.area) + (l.giorno ? ' · ' + l.giorno + ' novembre' : '') + '</span><p>' + esc(l.desc) + '</p>' +
        (l.fun && l.fun.length ? '<span class="lo-sapevi">' + esc(l.fun[0]) + '</span>' : '') + '</a>' + spunta(id, false, 'Visto: ' + l.nome) + '</article>';
    }).join('') + '</div>';
    return html;
  }

  function vistaLuogo(idLuogo) {
    var l = luogoPerId(idLuogo);
    if (!l) return vistaNonTrovata();
    var g = l.giorno ? giornoPerN(l.giorno) : null;
    var html = '<a class="indietro" href="#luoghi-' + l.gruppo + '">← Luoghi</a>';
    html += capo(l.tipo + ' · ' + l.area, l.jp, l.nome, l.desc);
    html += '<label class="card visto">' + spunta('luogo-' + l.id, false, 'Visto') + '<span>Visto</span></label>';
    if (l.fun && l.fun.length) html += '<section class="card"><div class="card-capo"><h2>Lo sapevi?</h2><span class="jp">豆知識</span></div><ul class="fatti">' + l.fun.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul></section>';
    var det = [];
    if (l.consiglio) det.push(['Consiglio', l.consiglio]);
    if (l.orari) det.push(['Orari', l.orari + ' (indicativi)']);
    if (l.come) det.push(['Come arrivare', l.come]);
    if (det.length) html += '<section class="card"><dl class="dettagli">' + det.map(function (d) { return '<div><dt>' + esc(d[0]) + '</dt><dd>' + esc(d[1]) + '</dd></div>'; }).join('') + '</dl></section>';
    if (g) html += '<a class="card giorno-card c-' + esc(g.citta) + '" href="#giorno-' + g.n + '"><div class="data"><b>' + g.n + '</b><span>' + esc(settimana(g.data).slice(0, 3)) + '</span></div><div><h3>' + esc(g.titolo) + '</h3><p>Nel programma di ' + esc(dataLunga(g)) + '</p></div><span class="kanji-sfondo">' + esc(g.kanji) + '</span></a>';
    return html;
  }

  // ── Liste ──
  function cartaLista(l) {
    var c = contaLista(l);
    return '<section class="card" id="lista-' + esc(l.id) + '"><div class="card-capo"><h2>' + esc(l.titolo) + '</h2><span class="jp">' + esc(l.jp) + '</span></div>' +
      (l.desc ? '<p class="muto piccolo-testo" style="margin:-6px 0 10px">' + esc(l.desc) + '</p>' : '') + barretta(c.fatte, c.totali) +
      '<ul class="voci" style="margin-top:6px">' + l.voci.map(function (v) {
        return voce(idVoce(l, v), v.fatto, v.testo, v.dettaglio ? [esc(v.dettaglio)] : []);
      }).join('') + '</ul>' + (l.tipo !== 'giornaliera' ? '<p style="margin-top:10px"><button type="button" class="btn piccolo chiaro" data-azzera="' + esc(l.id) + '">Azzera la lista</button></p>' : '') + '</section>';
  }
  var SEG_LISTE = [['liste', 'Checklist'], ['bucket', 'Bucket list'], ['mangiare', 'Mangiare']];
  function vistaListe() {
    var html = capo('Liste', '準備', 'Checklist', 'Le cose da fare prima e durante il viaggio. Le spunte restano salvate su questo telefono.');
    html += segmenti(SEG_LISTE, 'liste');
    D.liste.filter(function (l) { return l.tipo === 'checklist' || l.tipo === 'giornaliera'; }).forEach(function (l) { html += cartaLista(l); });
    return html;
  }
  function vistaBucket() {
    var html = capo('Liste', '夢', 'Bucket list', 'Esperienze, foto e negozi da collezionare man mano che andate avanti.');
    html += segmenti(SEG_LISTE, 'bucket');
    D.liste.filter(function (l) { return l.tipo === 'bucket'; }).forEach(function (l) { html += cartaLista(l); });
    return html;
  }
  function vistaMangiare() {
    var fatti = D.cibo.filter(function (c) { return fatto('cibo-' + c.id); }).length;
    var html = capo('Liste', '食', 'Da mangiare', 'Niente pesce: piatti vegani per Davide, i locali famosi per Sergio e tante cose buone per tutti e due.');
    html += segmenti(SEG_LISTE, 'mangiare');
    html += '<div class="card legenda"><span class="chip-per per-davide">Vegano</span> pensato per Davide <span class="chip-per per-entrambi">Tutti e due</span> va bene per entrambi <span class="chip-per per-sergio">Sergio</span> non vegano<p class="muto piccolo-testo" style="margin:8px 0 0">Il dashi, brodo di pesce, si nasconde in molti piatti: le frasi per chiederlo sono nella pagina Frasi.</p></div>';
    html += '<div class="card">' + barretta(fatti, D.cibo.length) + '</div>';
    var ordine = [];
    D.cibo.forEach(function (c) { if (ordine.indexOf(c.citta) < 0) ordine.push(c.citta); });
    ordine.forEach(function (citta) {
      var voci = D.cibo.filter(function (c) { return c.citta === citta; });
      html += '<section class="card"><div class="card-capo"><h2>' + esc(citta) + '</h2></div><ul class="voci cibo">' + voci.map(function (f) {
        return voce('cibo-' + f.id, false, f.nome, dettagliCibo(f, true), extraCibo(f));
      }).join('') + '</ul></section>';
    });
    return html;
  }

  // ── Info ──
  var SEG_INFO = [['info', 'Pratiche'], ['spostamenti', 'Spostamenti'], ['prenotazioni', 'Prenotazioni'], ['frasi', 'Frasi']];
  function sezioniTesto(arr) {
    return arr.map(function (s) {
      return '<section class="card"><div class="card-capo"><h2>' + esc(s.titolo) + '</h2><span class="jp">' + esc(s.jp) + '</span></div><ul class="puntini">' + s.testi.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></section>';
    }).join('');
  }
  function vistaInfo() {
    var html = capo('Info', '心得', 'Info pratiche', 'Soldi, tax-free, galateo, meteo, emergenze e link utili.');
    html += segmenti(SEG_INFO, 'info') + sezioniTesto(D.info);
    html += '<section class="card"><div class="card-capo"><h2>Link utili</h2><span class="jp">リンク</span></div><ul class="link-utili">' + D.link.map(function (l) {
      return '<li><a href="' + esc(l.url) + '" target="_blank" rel="noopener"><b>' + esc(l.nome) + ' ↗</b><span>' + esc(l.desc) + '</span></a></li>';
    }).join('') + '</ul></section>';
    return html;
  }
  function vistaSpostamenti() {
    return capo('Info', '交通', 'Spostamenti', 'Suica, treni, Shinkansen, valigie e collegamenti con Narita.') + segmenti(SEG_INFO, 'spostamenti') + sezioniTesto(D.spostamenti);
  }
  function vistaPrenotazioni() {
    var html = capo('Info', '予約', 'Prenotazioni', 'Tutto quello che è già prenotato, in ordine di data. I codici sono nelle email e nelle app.');
    html += segmenti(SEG_INFO, 'prenotazioni');
    html += '<section class="card"><ul class="prenotazioni">' + D.prenotazioni.map(function (p) {
      var ok = p.stato === 'ok';
      return '<li><span class="q">' + esc(p.quando) + '</span><b>' + esc(p.cosa) + '</b><span class="d">' + esc(p.dettagli) + '</span><span class="s chip ' + (ok ? 'stato-ok' : 'stato-no') + '">' + (ok ? 'Fatto' : 'Da fare') + '</span></li>';
    }).join('') + '</ul></section>';
    return html;
  }
  function vistaFrasi() {
    var html = capo('Info', '話', 'Frasi utili', 'Tocca una frase per mostrarla a tutto schermo a chi hai davanti.');
    html += segmenti(SEG_INFO, 'frasi');
    html += '<div class="frasi">' + D.frasi.map(function (f, i) {
      return '<button type="button" class="frase" data-frase="' + i + '"><span class="jp">' + esc(f.jp) + '</span><span class="ro">' + esc(f.ro) + '</span><span class="it">' + esc(f.it) + '</span></button>';
    }).join('') + '</div>';
    return html;
  }

  // ── Impostazioni ──
  function vistaImpostazioni() {
    var st = window.Musica ? window.Musica.stato() : { suona: false, volume: 0.7 };
    var tema = ls.get(K.tema) || 'auto';
    var html = capo('Impostazioni', '設定', 'Impostazioni');
    html += '<section class="card"><div class="riga"><span>Musica di sottofondo<small>Brani giapponesi generati sul momento, sempre diversi.</small></span><input type="checkbox" class="interruttore" id="imp-musica"' + (st.suona ? ' checked' : '') + ' aria-label="Musica"></div>' +
      '<div class="riga"><span>Volume</span><input type="range" id="imp-volume" min="0" max="1" step="0.05" value="' + st.volume + '" aria-label="Volume"></div>' +
      '<div class="riga"><span>Foglie che cadono</span><input type="checkbox" class="interruttore" id="imp-foglie"' + (ls.get(K.foglie) !== 'off' ? ' checked' : '') + ' aria-label="Foglie"></div>' +
      '<div class="riga"><span>Tema</span><select id="imp-tema" aria-label="Tema"><option value="auto"' + (tema === 'auto' ? ' selected' : '') + '>Automatico</option><option value="light"' + (tema === 'light' ? ' selected' : '') + '>Chiaro</option><option value="dark"' + (tema === 'dark' ? ' selected' : '') + '>Scuro</option></select></div></section>';
    html += '<section class="card"><div class="card-capo"><h2>Sincronizza con l\'altro telefono</h2><span class="jp">共有</span></div>' +
      '<p class="muto piccolo-testo">Le spunte sono salvate solo su questo telefono. Copia il codice, mandalo a chi viaggia con te e incollalo qui sul suo telefono: le spunte si sommano.</p>' +
      '<p style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn piccolo" data-azione="esporta">Copia il mio codice</button><button type="button" class="btn piccolo chiaro" data-azione="importa">Importa il codice incollato</button></p>' +
      '<textarea class="codice" id="codice" placeholder="Incolla qui il codice ricevuto" style="margin-top:10px"></textarea><p class="avviso" id="avviso-sync" role="status"></p></section>';
    html += '<section class="card"><div class="riga"><span>Azzera tutte le spunte<small>Itinerario, luoghi, cibo e liste su questo telefono.</small></span><button type="button" class="btn piccolo chiaro" data-azione="azzera-tutto">Azzera</button></div>' +
      '<div class="riga"><span>Blocca il sito<small>Dimentica la password su questo dispositivo.</small></span><button type="button" class="btn piccolo chiaro" data-azione="blocca">Blocca</button></div></section>';
    html += '<p class="muto piccolo-testo" style="text-align:center">Dati aggiornati al ' + esc(D.versione) + ' · Orari e aperture indicativi: ricontrollateli il giorno prima.</p>';
    return html;
  }

  function vistaNonTrovata() { return capo('Ops', '迷子', 'Pagina non trovata', 'Torna alla pagina Oggi dalla barra in basso.'); }

  // ── Router ──
  function rotta() { return (location.hash || '#oggi').slice(1) || 'oggi'; }
  function sezioneDi(r) {
    if (r === 'oggi') return 'oggi';
    if (r === 'itinerario' || r.indexOf('giorno-') === 0) return 'itinerario';
    if (r.indexOf('luogh') === 0 || r.indexOf('luogo-') === 0) return 'luoghi';
    if (r === 'liste' || r === 'bucket' || r === 'mangiare') return 'liste';
    if (r === 'info' || r === 'spostamenti' || r === 'prenotazioni' || r === 'frasi') return 'info';
    return '';
  }
  function disegna() {
    if (!D) return;
    var r = rotta(), html;
    if (r === 'oggi') html = vistaOggi();
    else if (r === 'itinerario') html = vistaItinerario();
    else if (r.indexOf('giorno-') === 0) html = vistaGiorno(r.slice(7));
    else if (r === 'luoghi') html = vistaLuoghi('tokyo');
    else if (r.indexOf('luoghi-') === 0) html = vistaLuoghi(r.slice(7));
    else if (r.indexOf('luogo-') === 0) html = vistaLuogo(r.slice(6));
    else if (r === 'liste') html = vistaListe();
    else if (r === 'bucket') html = vistaBucket();
    else if (r === 'mangiare') html = vistaMangiare();
    else if (r === 'info') html = vistaInfo();
    else if (r === 'spostamenti') html = vistaSpostamenti();
    else if (r === 'prenotazioni') html = vistaPrenotazioni();
    else if (r === 'frasi') html = vistaFrasi();
    else if (r === 'impostazioni') html = vistaImpostazioni();
    else html = vistaNonTrovata();
    var stessa = r === ultimaRotta, y = window.scrollY;
    $('app').innerHTML = '<div class="vista"' + (stessa ? ' style="animation:none"' : '') + '>' + html + '</div>';
    var sez = sezioneDi(r);
    document.querySelectorAll('#navigazione a').forEach(function (a) { if (a.dataset.sez === sez) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (stessa) window.scrollTo(0, y); else window.scrollTo(0, 0);
    ultimaRotta = r;
    document.title = 'Giappone 2026';
  }

  // ── Eventi ──
  function collegaEventi() {
    window.addEventListener('hashchange', disegna);
    $('app').addEventListener('change', function (e) {
      var t = e.target;
      if (t.classList.contains('spunta')) { imposta(t.dataset.sp, t.checked); disegna(); return; }
      if (t.id === 'imp-musica') { if (t.checked) { ls.set(K.musica, 'on'); window.Musica.avvia(); } else { ls.set(K.musica, 'off'); window.Musica.pausa(); } return; }
      if (t.id === 'imp-foglie') { ls.set(K.foglie, t.checked ? 'on' : 'off'); document.body.classList.toggle('senza-foglie', !t.checked); return; }
      if (t.id === 'imp-tema') { ls.set(K.tema, t.value); applicaTema(); return; }
    });
    $('app').addEventListener('input', function (e) {
      if (e.target.id === 'imp-volume') { window.Musica.volume(+e.target.value); ls.set(K.volume, e.target.value); }
    });
    $('app').addEventListener('click', function (e) {
      var b = e.target.closest('[data-azione],[data-azzera],[data-frase]');
      if (!b) return;
      if (b.dataset.frase != null) { var f = D.frasi[+b.dataset.frase]; $('mostra-jp').textContent = f.jp; $('mostra-it').textContent = f.ro + ' · ' + f.it; $('mostra').hidden = false; return; }
      if (b.dataset.azzera) {
        var l = lista(b.dataset.azzera);
        if (l && confirm('Azzerare la lista "' + l.titolo + '"?')) { l.voci.forEach(function (v) { spunte[idVoce(l, v)] = 0; }); salvaSpunte(); disegna(); }
        return;
      }
      var a = b.dataset.azione;
      if (a === 'curiosita') { curiositaIndice = (curiositaIndice + 1 + Math.floor(Math.random() * (D.curiosita.length - 1))) % D.curiosita.length; disegna(); }
      else if (a === 'esporta') esporta();
      else if (a === 'importa') importa();
      else if (a === 'azzera-tutto') { if (confirm('Azzerare tutte le spunte su questo telefono?')) { spunte = {}; salvaSpunte(); disegna(); } }
      else if (a === 'blocca') { if (confirm('Dimenticare la password su questo dispositivo?')) { ls.del(K.chiave); location.reload(); } }
    });
    $('mostra').addEventListener('click', function () { $('mostra').hidden = true; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $('mostra').hidden = true; });
  }

  function esporta() {
    var codice = 'G26:' + btoa(unescape(encodeURIComponent(JSON.stringify(spunte))));
    var area = $('codice'), avviso = $('avviso-sync');
    area.value = codice;
    var fatto = function () { avviso.textContent = 'Codice copiato: mandalo all\'altro telefono, per esempio su WhatsApp.'; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(codice).then(fatto, function () { area.select(); avviso.textContent = 'Copia il codice selezionato qui sopra.'; });
    else { area.select(); avviso.textContent = 'Copia il codice selezionato qui sopra.'; }
  }
  function importa() {
    var testo = ($('codice').value || '').trim(), avviso = $('avviso-sync');
    try {
      if (testo.indexOf('G26:') !== 0) throw new Error();
      var altre = JSON.parse(decodeURIComponent(escape(atob(testo.slice(4)))));
      var nuove = 0;
      Object.keys(altre).forEach(function (k) { if (altre[k] === 1 && spunte[k] !== 1) { spunte[k] = 1; nuove++; } });
      salvaSpunte();
      disegna();
      $('avviso-sync').textContent = 'Fatto: ' + nuove + (nuove === 1 ? ' spunta aggiunta.' : ' spunte aggiunte.');
    } catch (e) { avviso.textContent = 'Il codice non è valido: deve iniziare con G26:'; }
  }

  // ── Musica ──
  var ICONA_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5v14l12-7L7 5Z"/></svg>';
  var ICONA_PAUSA = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
  function aggiornaLettore(st) {
    var l = $('lettore');
    l.classList.toggle('suona', st.suona);
    $('m-play').innerHTML = st.suona ? ICONA_PAUSA : ICONA_PLAY;
    $('m-play').setAttribute('aria-label', st.suona ? 'Metti in pausa la musica' : 'Avvia la musica');
    $('m-titolo').innerHTML = st.titolo ? '<b>' + esc(st.titolo.jp) + '</b><span>' + esc(st.titolo.it) + '</span>' : '<b>Musica</b><span>tocca per ascoltare</span>';
  }
  function preparaMusica(daGesto) {
    if (!window.Musica) return;
    var vol = parseFloat(ls.get(K.volume));
    if (!isNaN(vol)) window.Musica.volume(vol);
    window.Musica.ascolta(aggiornaLettore);
    aggiornaLettore(window.Musica.stato());
    $('lettore').hidden = false;
    $('m-play').addEventListener('click', function () {
      if (window.Musica.stato().suona) { window.Musica.pausa(); ls.set(K.musica, 'off'); }
      else { window.Musica.avvia(); ls.set(K.musica, 'on'); }
    });
    $('m-prossimo').addEventListener('click', function () { window.Musica.prossimo(); ls.set(K.musica, 'on'); });
    if (ls.get(K.musica) === 'off') return;
    // Il browser permette l'audio solo dopo un tocco: si parte con il primo
    var parti = function () { try { window.Musica.avvia(); } catch (e) {} };
    if (daGesto) parti();
    else {
      var primoTocco = function (e) {
        if (e.target.closest && e.target.closest('#lettore')) return;
        document.removeEventListener('pointerdown', primoTocco, true);
        parti();
      };
      document.addEventListener('pointerdown', primoTocco, true);
    }
  }

  // ── Aspetto ──
  function applicaTema() {
    var t = ls.get(K.tema) || 'auto';
    if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
  }
  function foglie() {
    if (ls.get(K.foglie) === 'off') document.body.classList.add('senza-foglie');
    var box = document.querySelector('.foglie'), colori = ['#B8432F', '#D9792E', '#C4562F', '#A8392A', '#D9792E'];
    var n = window.innerWidth < 600 ? 16 : 26;
    for (var i = 0; i < n; i++) {
      var el = document.createElement('div'), d = 14 + Math.random() * 12;
      el.className = 'foglia';
      el.style.left = (Math.random() * 100) + '%';
      el.style.setProperty('--s', (13 + Math.random() * 17).toFixed(0) + 'px');
      el.style.setProperty('--o', (0.3 + Math.random() * 0.35).toFixed(2));
      el.style.setProperty('--d', d.toFixed(1) + 's');
      el.style.setProperty('--r', (-Math.random() * d).toFixed(1) + 's');
      el.style.setProperty('--x', ((Math.random() - 0.5) * 220).toFixed(0) + 'px');
      // Una foglia su tre è di ginkgo, gialla
      el.innerHTML = i % 3 === 2
        ? '<svg viewBox="-32 -30 64 60"><path d="' + GINKGO + '" fill="#D6A23A"/><path d="M0,6 L1,26" stroke="#B8862A" stroke-width="2.5" stroke-linecap="round"/></svg>'
        : '<svg viewBox="-36 -52 72 64"><path d="' + FOGLIA + '" fill="' + colori[i % colori.length] + '"/></svg>';
      box.appendChild(el);
    }
  }

  // ── Avvio ──
  function mostraApp(daGesto) {
    caricaSpunte();
    $('blocco').hidden = true;
    $('testata').hidden = false;
    $('navigazione').hidden = false;
    collegaEventi();
    disegna();
    preparaMusica(daGesto);
  }

  function avvia() {
    applicaTema();
    foglie();
    var pacchetto = null;
    var caricamento = fetch('dati.enc.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('rete'); return r.json(); }).then(function (p) { pacchetto = p; return p; });

    var salvata = ls.get(K.chiave);
    if (salvata) {
      caricamento.then(function (p) {
        return crypto.subtle.importKey('raw', daB64(salvata), 'AES-GCM', false, ['decrypt']).then(function (k) { return decifra(k, p); });
      }).then(function (dati) { D = dati; mostraApp(false); }).catch(function () { $('blocco').hidden = false; });
    } else {
      $('blocco').hidden = false;
    }

    $('form-blocco').addEventListener('submit', function (e) {
      e.preventDefault();
      var pw = $('pw').value, bottone = $('entra'), err = $('errore-pw');
      if (!pw) return;
      err.textContent = '';
      bottone.disabled = true;
      bottone.textContent = 'Apro…';
      // Il tocco su "Entra" sblocca anche l'audio
      var musicaAvviata = false;
      if (window.Musica && ls.get(K.musica) !== 'off') { try { window.Musica.avvia(); musicaAvviata = true; } catch (x) {} }
      caricamento.then(function (p) {
        return chiaveDaPassword(pw, p).then(function (k) {
          return decifra(k, p).then(function (dati) {
            if ($('ricorda').checked) return crypto.subtle.exportKey('raw', k).then(function (raw) { ls.set(K.chiave, aB64(raw)); return dati; });
            return dati;
          });
        });
      }).then(function (dati) {
        D = dati;
        mostraApp(true);
      }).catch(function (x) {
        if (musicaAvviata) window.Musica.pausa();
        err.textContent = x && x.message === 'rete' ? 'Non riesco a scaricare i dati: controlla la connessione.' : 'Password sbagliata, riprova.';
        bottone.disabled = false;
        bottone.textContent = 'Entra';
      });
    });

    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  avvia();
})();
