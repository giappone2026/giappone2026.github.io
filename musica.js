// Musica di sottofondo generata nel browser: ogni brano è nuovo e casuale.
// Strumenti sintetizzati: koto (corda pizzicata Karplus-Strong), shakuhachi (flauto con vibrato e soffio),
// fūrin (campanelli a vento), campana di tempio e un bordone leggero. Scale pentatoniche giapponesi.
(function () {
  'use strict';

  var SCALE = [
    { nome: 'in', passi: [0, 1, 5, 7, 8] },
    { nome: 'yo', passi: [0, 2, 5, 7, 9] },
    { nome: 'hirajoshi', passi: [0, 2, 3, 7, 8] },
    { nome: 'kumoi', passi: [0, 2, 3, 7, 9] },
    { nome: 'iwato', passi: [0, 1, 5, 6, 10] }
  ];

  var TITOLI = [
    ['紅葉の庭', 'Il giardino d\'acero'],
    ['竹林の風', 'Vento nel bambù'],
    ['月夜の川', 'Fiume al chiaro di luna'],
    ['朝霧の鳥居', 'Torii nella nebbia'],
    ['鹿の小道', 'Il sentiero dei cervi'],
    ['狐の祭り', 'La festa delle volpi'],
    ['宇治の茶畑', 'I campi di tè di Uji'],
    ['遠い富士', 'Il Fuji lontano'],
    ['夕暮れの鐘', 'Campana al tramonto'],
    ['秋の雨', 'Pioggia d\'autunno'],
    ['灯籠の夜', 'Notte di lanterne'],
    ['静かな池', 'Lo stagno silenzioso'],
    ['千本鳥居', 'Mille torii'],
    ['風鈴の午後', 'Pomeriggio di campanelli'],
    ['銀杏の道', 'Il viale dei ginkgo'],
    ['山の寺', 'Il tempio sulla montagna']
  ];

  var ctx = null, uscita = null, riverbero = null, eco = null, volumeNodo = null;
  var rumore = null, cacheCorde = {};
  var brano = null, prossimoBrano = null, timer = null;
  var suona = false, volume = 0.7, ultimoTitolo = -1;
  var ascoltatori = [];

  function caso(a, b) { return a + Math.random() * (b - a); }
  function scegli(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function hz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  function avvisa() { ascoltatori.forEach(function (f) { try { f(stato()); } catch (e) {} }); }
  function stato() { return { suona: suona, titolo: brano ? brano.titolo : null, volume: volume }; }

  // ── Catena audio ──
  function preparaCatena(c) {
    var comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.4;
    var vol = c.createGain(); vol.gain.value = volume;
    var guadagno = c.createGain(); guadagno.gain.value = 1.7;
    vol.connect(comp); comp.connect(guadagno); guadagno.connect(c.destination);

    // Riverbero: risposta all'impulso sintetica, coda di circa 3,5 secondi
    var conv = c.createConvolver();
    var lung = Math.floor(c.sampleRate * 3.5), ir = c.createBuffer(2, lung, c.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = ir.getChannelData(ch), prec = 0;
      for (var i = 0; i < lung; i++) {
        var t = i / c.sampleRate;
        var r = (Math.random() * 2 - 1) * Math.exp(-t / 0.95);
        prec = prec * 0.55 + r * 0.45;
        d[i] = t < 0.012 ? 0 : prec;
      }
    }
    conv.buffer = ir;
    var rit = c.createGain(); rit.gain.value = 0.42;
    conv.connect(rit); rit.connect(vol);

    // Eco morbida per il koto
    var ritardo = c.createDelay(2); ritardo.delayTime.value = 0.42;
    var retro = c.createGain(); retro.gain.value = 0.28;
    var filtro = c.createBiquadFilter(); filtro.type = 'lowpass'; filtro.frequency.value = 2400;
    var ecoUscita = c.createGain(); ecoUscita.gain.value = 0.22;
    ritardo.connect(filtro); filtro.connect(retro); retro.connect(ritardo); filtro.connect(ecoUscita); ecoUscita.connect(vol);

    // Rumore bianco riutilizzabile per il soffio del flauto
    var nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), nd = nb.getChannelData(0);
    for (var k = 0; k < nd.length; k++) nd[k] = Math.random() * 2 - 1;

    return { uscita: vol, riverbero: conv, eco: ritardo, volume: vol, rumore: nb };
  }

  // ── Strumenti ──
  function corda(c, midi) {
    var chiave = midi;
    if (cacheCorde[chiave]) return cacheCorde[chiave];
    var sr = c.sampleRate, f = hz(midi), durata = midi < 55 ? 3.4 : 2.6;
    var n = Math.floor(sr * durata), buf = c.createBuffer(1, n, sr), d = buf.getChannelData(0);
    var p = Math.max(2, Math.round(sr / f)), linea = new Float32Array(p), lp = 0;
    for (var i = 0; i < p; i++) { lp = lp * 0.35 + (Math.random() * 2 - 1) * 0.65; linea[i] = lp; }
    var idx = 0, smorzo = midi < 55 ? 0.9975 : 0.996;
    for (var j = 0; j < n; j++) {
      var a = linea[idx], b = linea[(idx + 1) % p];
      linea[idx] = smorzo * 0.5 * (a + b);
      d[j] = a;
      idx = (idx + 1) % p;
    }
    // Attacco più netto e chiusura dolce
    var fine = Math.floor(sr * 0.25);
    for (var q = 0; q < fine; q++) d[n - 1 - q] *= q / fine;
    cacheCorde[chiave] = buf;
    return buf;
  }

  function koto(c, dest, t, midi, vel, opz) {
    opz = opz || {};
    var src = c.createBufferSource(); src.buffer = corda(c, midi);
    var g = c.createGain(); g.gain.value = vel * 0.55;
    var pan = c.createStereoPanner ? c.createStereoPanner() : null;
    if (opz.piega) {
      // Oshide: la mano preme la corda e alza la nota
      src.playbackRate.setValueAtTime(1, t);
      src.playbackRate.setValueAtTime(1, t + opz.piega.dopo);
      src.playbackRate.linearRampToValueAtTime(Math.pow(2, opz.piega.semitoni / 12), t + opz.piega.dopo + 0.18);
    }
    src.connect(g);
    var nodo = g;
    if (pan) { pan.pan.value = opz.pan != null ? opz.pan : caso(-0.35, 0.35); g.connect(pan); nodo = pan; }
    nodo.connect(dest.bus);
    var mandata = c.createGain(); mandata.gain.value = 0.35; nodo.connect(mandata); mandata.connect(riverbero);
    if (opz.eco) { var me = c.createGain(); me.gain.value = 0.5; nodo.connect(me); me.connect(eco); }
    src.start(t);
    src.stop(t + src.buffer.duration);
  }

  function flauto(c, dest, t, midi, dur, vel) {
    var f = hz(midi);
    var o1 = c.createOscillator(); o1.type = 'sine';
    var o2 = c.createOscillator(); o2.type = 'triangle';
    var o3 = c.createOscillator(); o3.type = 'sine';
    [o1, o2].forEach(function (o) {
      o.frequency.setValueAtTime(f * 0.955, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.28);
    });
    o3.frequency.setValueAtTime(f * 2 * 0.955, t);
    o3.frequency.exponentialRampToValueAtTime(f * 2, t + 0.28);
    // Vibrato che cresce verso la fine della nota (yuri)
    var lfo = c.createOscillator(); lfo.frequency.value = caso(4.4, 5.6);
    var prof = c.createGain();
    prof.gain.setValueAtTime(0, t);
    prof.gain.setValueAtTime(0, t + dur * 0.35);
    prof.gain.linearRampToValueAtTime(f * 0.012, t + dur * 0.85);
    lfo.connect(prof); prof.connect(o1.frequency); prof.connect(o2.frequency);
    var m1 = c.createGain(); m1.gain.value = 0.8;
    var m2 = c.createGain(); m2.gain.value = 0.18;
    var m3 = c.createGain(); m3.gain.value = 0.07;
    o1.connect(m1); o2.connect(m2); o3.connect(m3);
    var filtro = c.createBiquadFilter(); filtro.type = 'lowpass'; filtro.frequency.value = f * 5; filtro.Q.value = 0.4;
    m1.connect(filtro); m2.connect(filtro); m3.connect(filtro);
    // Soffio
    var soffio = c.createBufferSource(); soffio.buffer = rumore; soffio.loop = true;
    var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2.2; bp.Q.value = 0.9;
    var gs = c.createGain();
    gs.gain.setValueAtTime(0, t);
    gs.gain.linearRampToValueAtTime(vel * 0.09, t + 0.07);
    gs.gain.linearRampToValueAtTime(vel * 0.025, t + 0.35);
    gs.gain.setValueAtTime(vel * 0.025, t + dur);
    gs.gain.linearRampToValueAtTime(0, t + dur + 0.5);
    soffio.connect(bp); bp.connect(gs);
    var inv = c.createGain();
    inv.gain.setValueAtTime(0, t);
    inv.gain.linearRampToValueAtTime(vel * 0.16, t + 0.3);
    inv.gain.linearRampToValueAtTime(vel * 0.2, t + dur * 0.6);
    inv.gain.setValueAtTime(vel * 0.2, t + dur);
    inv.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.7);
    filtro.connect(inv);
    var pan = c.createStereoPanner ? c.createStereoPanner() : null;
    var nodo = c.createGain();
    inv.connect(nodo); gs.connect(nodo);
    if (pan) { pan.pan.value = caso(-0.15, 0.15); nodo.connect(pan); nodo = pan; }
    nodo.connect(dest.bus);
    var mandata = c.createGain(); mandata.gain.value = 0.6; nodo.connect(mandata); mandata.connect(riverbero);
    var fine = t + dur + 0.8;
    [o1, o2, o3, lfo, soffio].forEach(function (o) { o.start(t); o.stop(fine); });
  }

  function campanello(c, dest, t, f, vel) {
    // Fūrin: parziali non armoniche, decadimento rapido
    var rapporti = [1, 2.76, 5.4, 8.93], ampiezze = [1, 0.5, 0.25, 0.12];
    var pan = c.createStereoPanner ? c.createStereoPanner() : null;
    var somma = c.createGain(); somma.gain.value = vel * 0.05;
    rapporti.forEach(function (r, i) {
      var o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f * r * caso(0.997, 1.003);
      var g = c.createGain();
      var dec = (2.6 - i * 0.5) * caso(0.8, 1.2);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(ampiezze[i], t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.connect(g); g.connect(somma);
      o.start(t); o.stop(t + dec + 0.05);
    });
    var nodo = somma;
    if (pan) { pan.pan.value = caso(-0.7, 0.7); somma.connect(pan); nodo = pan; }
    nodo.connect(dest.bus);
    var mandata = c.createGain(); mandata.gain.value = 0.8; nodo.connect(mandata); mandata.connect(riverbero);
  }

  function campana(c, dest, t, f, vel) {
    // Campana di tempio (rin): parziali gravi e lunghe
    var rapporti = [1, 2.32, 4.25, 6.63], ampiezze = [1, 0.55, 0.3, 0.14];
    var somma = c.createGain(); somma.gain.value = vel * 0.12;
    rapporti.forEach(function (r, i) {
      var o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f * r;
      var g = c.createGain(), dec = 7 - i * 1.3;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(ampiezze[i], t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      // Battimenti lenti
      var b = c.createOscillator(); b.frequency.value = f * r + caso(0.6, 1.8);
      var gb = c.createGain(); gb.gain.value = ampiezze[i] * 0.3;
      gb.gain.setValueAtTime(0, t); gb.gain.linearRampToValueAtTime(ampiezze[i] * 0.3, t + 0.01); gb.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.connect(g); g.connect(somma); b.connect(gb); gb.connect(somma);
      o.start(t); o.stop(t + dec + 0.1); b.start(t); b.stop(t + dec + 0.1);
    });
    somma.connect(dest.bus);
    var mandata = c.createGain(); mandata.gain.value = 0.7; somma.connect(mandata); mandata.connect(riverbero);
  }

  function bordone(c, dest, t, dur, midi) {
    var f = hz(midi);
    var g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.022, t + 6);
    g.gain.setValueAtTime(0.022, t + dur - 8);
    g.gain.linearRampToValueAtTime(0, t + dur);
    var filtro = c.createBiquadFilter(); filtro.type = 'lowpass'; filtro.frequency.value = 520;
    var lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    var lg = c.createGain(); lg.gain.value = 180;
    lfo.connect(lg); lg.connect(filtro.frequency);
    [f, f * 1.5, f * 2.003].forEach(function (fr, i) {
      var o = c.createOscillator(); o.type = i === 1 ? 'sine' : 'triangle'; o.frequency.value = fr;
      var gi = c.createGain(); gi.gain.value = i === 0 ? 1 : 0.5;
      o.connect(gi); gi.connect(filtro);
      o.start(t); o.stop(t + dur + 0.1);
    });
    lfo.start(t); lfo.stop(t + dur + 0.1);
    filtro.connect(g); g.connect(dest.bus);
    var mandata = c.createGain(); mandata.gain.value = 0.5; g.connect(mandata); mandata.connect(riverbero);
  }

  // ── Composizione ──
  function componi() {
    var scala = scegli(SCALE);
    var radice = Math.floor(caso(50, 57));
    var quinta = scala.passi[3];
    var bpm = Math.round(caso(54, 80));
    var battito = 60 / bpm;
    var durata = caso(110, 170);
    var indiceTitolo;
    do { indiceTitolo = Math.floor(Math.random() * TITOLI.length); } while (indiceTitolo === ultimoTitolo && TITOLI.length > 1);
    ultimoTitolo = indiceTitolo;

    // Note della scala su tre ottave e mezza
    var note = [];
    for (var o = -1; o < 3; o++) scala.passi.forEach(function (p) { note.push(radice + o * 12 + p); });
    note.sort(function (a, b) { return a - b; });
    var centro = note.indexOf(radice + 12);

    var eventi = [];
    var conFlauto = Math.random() < 0.75, conFurin = Math.random() < 0.8, conBordone = Math.random() < 0.6, conCampana = Math.random() < 0.55;
    if (conBordone) eventi.push({ t: 0.2, tipo: 'bordone', midi: radice - 12, dur: durata });
    if (conCampana) eventi.push({ t: 0.4, tipo: 'campana', f: hz(radice + 12), vel: 0.8 });

    var battute = Math.floor(durata / (4 * battito));
    var ritmi = [[1, 1, 1, 1], [1.5, 0.5, 1, 1], [0.5, 0.5, 1, 2], [2, 1, 1], [1, 0.5, 0.5, 2], [3, 1], [1, 1, 2], [0.5, 0.5, 0.5, 0.5, 2]];
    var pos = centro, motivo = null;

    function sezione(b) {
      var x = b / battute;
      return x < 0.08 ? 'intro' : x < 0.4 ? 'a' : x < 0.7 ? (conFlauto ? 'b' : 'a') : x < 0.93 ? 'a2' : 'fine';
    }
    function sararin(t, dalBasso) {
      // Glissando del koto: corsa veloce verso l'alto
      var i0 = Math.max(0, centro - (dalBasso ? 6 : 3)), passi = Math.floor(caso(6, 9));
      for (var k = 0; k < passi && i0 + k < note.length; k++) eventi.push({ t: t + k * caso(0.045, 0.065), tipo: 'koto', midi: note[i0 + k], vel: 0.32 + k * 0.03 });
    }
    function nuovoMotivo() {
      var ritmo = scegli(ritmi), m = [], p = pos;
      ritmo.forEach(function (durN, i) {
        var salto = scegli([-2, -1, -1, 0, 1, 1, 2, 3, -3]);
        p = Math.min(Math.max(p + salto, centro - 3), centro + 7);
        var pausa = Math.random() < 0.12 && i > 0;
        m.push({ d: durN, i: p, pausa: pausa });
      });
      // Chiusura sulla tonica o sulla quinta
      var ultimo = m[m.length - 1];
      if (Math.random() < 0.6) ultimo.i = note.indexOf(radice + (Math.random() < 0.5 ? 12 : 12 + quinta));
      if (ultimo.i < 0) ultimo.i = centro;
      pos = p;
      return m;
    }

    var precSez = null, t = 1.5;
    for (var b = 0; b < battute; b++) {
      var sez = sezione(b), inizio = t;
      if (sez !== precSez && (sez === 'a' || sez === 'b' || sez === 'a2')) {
        sararin(inizio - 0.4, sez !== 'b');
        if (sez === 'b' && conCampana && Math.random() < 0.6) eventi.push({ t: inizio, tipo: 'campana', f: hz(radice + quinta), vel: 0.5 });
      }
      precSez = sez;

      // Basso del koto a inizio battuta
      if (Math.random() < (sez === 'intro' || sez === 'fine' ? 0.5 : 0.75)) {
        eventi.push({ t: inizio, tipo: 'koto', midi: scegli([radice, radice, radice + quinta, radice + quinta - 12]), vel: 0.42 });
      }

      if (sez === 'a' || sez === 'a2') {
        if (b % 2 === 0 || !motivo) motivo = (motivo && Math.random() < 0.45) ? motivo.map(function (n) { return { d: n.d, i: Math.min(n.i + scegli([-1, 1, 0]), note.length - 1), pausa: n.pausa }; }) : nuovoMotivo();
        var tt = inizio;
        motivo.forEach(function (n) {
          if (!n.pausa) {
            var opz = { eco: Math.random() < 0.35 };
            if (n.d >= 1.5 && Math.random() < 0.18 && n.i + 1 < note.length) opz.piega = { dopo: n.d * battito * 0.35, semitoni: note[n.i + 1] - note[n.i] };
            eventi.push({ t: tt + caso(-0.012, 0.012), tipo: 'koto', midi: note[n.i], vel: caso(0.5, 0.75), opz: opz });
          }
          tt += n.d * battito;
        });
      } else if (sez === 'b') {
        // Ostinato leggero del koto sotto il flauto
        for (var k = 0; k < 4; k += 2) eventi.push({ t: inizio + k * battito, tipo: 'koto', midi: scegli([radice + 12, radice + quinta, radice + 12 + quinta]), vel: 0.28 });
        if (b % 2 === 0) {
          var tf = inizio + caso(0, 1) * battito, pf = centro + Math.floor(caso(1, 5));
          var frase = Math.floor(caso(2, 4));
          for (var fn = 0; fn < frase; fn++) {
            var dur = scegli([1.5, 2, 3, 2.5]) * battito;
            pf = Math.min(Math.max(pf + scegli([-1, -1, 1, 1, 2, -2, 0]), centro), centro + 8);
            eventi.push({ t: tf, tipo: 'flauto', midi: note[pf], dur: dur, vel: caso(0.6, 0.85) });
            tf += dur + caso(0.1, 0.6);
          }
        }
      } else {
        if (Math.random() < 0.5) eventi.push({ t: inizio + 2 * battito, tipo: 'koto', midi: note[centro + Math.floor(caso(0, 5))], vel: 0.4, opz: { eco: true } });
      }
      t += 4 * battito;
    }
    // Chiusura
    eventi.push({ t: t, tipo: 'koto', midi: radice, vel: 0.5 });
    eventi.push({ t: t + 0.06, tipo: 'koto', midi: radice + quinta, vel: 0.4 });
    eventi.push({ t: t + 0.12, tipo: 'koto', midi: radice + 12, vel: 0.4, opz: { eco: true } });

    if (conFurin) {
      var toni = [scegli([2093, 2217, 2349]), scegli([2637, 2794]), scegli([3136, 3322])];
      for (var ft = caso(4, 14); ft < t; ft += caso(14, 32)) {
        var colpi = Math.floor(caso(2, 5));
        for (var cc = 0; cc < colpi; cc++) eventi.push({ t: ft + cc * caso(0.12, 0.45), tipo: 'furin', f: scegli(toni), vel: caso(0.5, 1) });
      }
    }

    eventi.sort(function (a, b) { return a.t - b.t; });
    return { titolo: { jp: TITOLI[indiceTitolo][0], it: TITOLI[indiceTitolo][1] }, scala: scala.nome, bpm: bpm, durata: t + 5, eventi: eventi };
  }

  function suonaEvento(c, dest, e, base) {
    var t = base + e.t;
    if (e.tipo === 'koto') koto(c, dest, t, e.midi, e.vel, e.opz);
    else if (e.tipo === 'flauto') flauto(c, dest, t, e.midi, e.dur, e.vel);
    else if (e.tipo === 'furin') campanello(c, dest, t, e.f, e.vel);
    else if (e.tipo === 'campana') campana(c, dest, t, e.f, e.vel);
    else if (e.tipo === 'bordone') bordone(c, dest, t, e.dur, e.midi);
  }

  // ── Riproduzione ──
  function avviaBrano(quando) {
    var b = componi();
    b.bus = ctx.createGain();
    b.bus.gain.setValueAtTime(0, quando);
    b.bus.gain.linearRampToValueAtTime(1, quando + 3);
    b.bus.connect(uscita);
    b.base = quando;
    b.indice = 0;
    return b;
  }

  function programma() {
    if (!ctx || !brano) return;
    var ora = ctx.currentTime, avanti = ora + 0.6;
    [brano, prossimoBrano].forEach(function (b) {
      if (!b) return;
      while (b.indice < b.eventi.length && b.base + b.eventi[b.indice].t < avanti) {
        var e = b.eventi[b.indice++];
        if (b.base + e.t >= ora - 0.05) suonaEvento(ctx, b, e, b.base);
      }
    });
    // Dissolvenza incrociata verso il brano successivo
    if (!prossimoBrano && ora > brano.base + brano.durata - 6) {
      brano.bus.gain.setValueAtTime(1, ora);
      brano.bus.gain.linearRampToValueAtTime(0, ora + 6);
      var vecchio = brano;
      setTimeout(function () { try { vecchio.bus.disconnect(); } catch (e) {} }, 9000);
      prossimoBrano = avviaBrano(ora + 3);
    }
    if (prossimoBrano && ora >= prossimoBrano.base) {
      brano = prossimoBrano; prossimoBrano = null; avvisa();
    }
  }

  function inizializza() {
    if (ctx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('Web Audio non disponibile');
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    ctx = new AC();
    var cat = preparaCatena(ctx);
    uscita = cat.uscita; riverbero = cat.riverbero; eco = cat.eco; volumeNodo = cat.volume; rumore = cat.rumore;
  }

  function avvia() {
    inizializza();
    if (ctx.state === 'suspended') ctx.resume();
    if (!brano) brano = avviaBrano(ctx.currentTime + 0.2);
    if (!timer) timer = setInterval(programma, 120);
    suona = true;
    avvisa();
  }

  function pausa() {
    if (!ctx) return;
    ctx.suspend();
    suona = false;
    avvisa();
  }

  function prossimo() {
    if (!ctx) { avvia(); return; }
    var ora = ctx.currentTime;
    if (brano) {
      var vecchio = brano;
      vecchio.bus.gain.cancelScheduledValues(ora);
      vecchio.bus.gain.setValueAtTime(vecchio.bus.gain.value, ora);
      vecchio.bus.gain.linearRampToValueAtTime(0, ora + 1.2);
      vecchio.indice = vecchio.eventi.length;
      setTimeout(function () { try { vecchio.bus.disconnect(); } catch (e) {} }, 5000);
    }
    if (prossimoBrano) { try { prossimoBrano.bus.disconnect(); } catch (e) {} prossimoBrano = null; }
    brano = avviaBrano(ora + 0.8);
    if (!suona) avvia(); else avvisa();
  }

  function impostaVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (volumeNodo) volumeNodo.gain.setTargetAtTime(volume, ctx.currentTime, 0.1);
    avvisa();
  }

  // Si ferma quando l'app va in secondo piano e riprende al ritorno
  var eraAccesa = false;
  document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    if (document.hidden) { eraAccesa = suona; if (suona) ctx.suspend(); }
    else if (eraAccesa) { ctx.resume(); }
  });

  window.Musica = {
    avvia: avvia,
    pausa: pausa,
    prossimo: prossimo,
    volume: impostaVolume,
    stato: stato,
    ascolta: function (f) { ascoltatori.push(f); },
    // Per i test: compone un brano e lo suona su un contesto dato (anche offline)
    _prova: function (c, secondi) {
      var cat = preparaCatena(c);
      uscita = cat.uscita; riverbero = cat.riverbero; eco = cat.eco; rumore = cat.rumore; cacheCorde = {};
      var b = componi(); b.bus = c.createGain(); b.bus.connect(uscita);
      b.eventi.forEach(function (e) { if (e.t < secondi) suonaEvento(c, b, e, 0); });
      return b;
    }
  };
})();
