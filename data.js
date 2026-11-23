"use strict";
/* Geometria: vista lon 14.15-16.05, lat 40.2-41.2. Coordinate in km e in px logici (960x668). */
const G = { lon0: 14.15, lat1: 41.2, W: 960, H: 668, kx: 84.2, ky: 111, PX: 960 / (1.9 * 84.2) };
const toKm = (lat, lon) => ({ x: (lon - G.lon0) * G.kx, y: (G.lat1 - lat) * G.ky });
const toPx = (lat, lon) => { const p = toKm(lat, lon); return { x: p.x * G.PX, y: p.y * G.PX }; };

/* Costa tirrenica semplificata [lat, lon], terra a destra */
const COAST = [[41.2,14.15],[40.82,14.15],[40.835,14.22],[40.84,14.27],[40.80,14.34],[40.78,14.38],[40.74,14.45],
  [40.70,14.48],[40.66,14.42],[40.63,14.37],[40.60,14.34],[40.565,14.33],[40.59,14.40],[40.625,14.48],[40.63,14.60],
  [40.66,14.72],[40.68,14.78],[40.64,14.87],[40.57,14.95],[40.48,14.99],[40.42,15.00],[40.35,14.99],[40.27,14.92],[40.2,14.92]];

/* Tre sottoeventi (0, 20, 40 s). Geometrie indicative.
   t = secondo di innesco, a-b = traccia, o = origine delle onde, amp = peso relativo */
const SEGS = [
  { k: 1, t: 0,  a: [40.84,15.30], b: [40.95,15.13], o: [40.84,15.30], amp: 0.8, name: "Marzano–Carpineta" },
  { k: 2, t: 20, a: [40.74,15.34], b: [40.63,15.45], o: [40.74,15.34], amp: 0.6, name: "San Gregorio Magno" },
  { k: 3, t: 40, a: [40.88,15.40], b: [40.99,15.26], o: [40.88,15.40], amp: 1.0, name: "Segmento nord-est" }
];

/* r: 1 = etichetta sempre, 2 = etichetta se c'è spazio, 0 = nessuna; city = città grande */
const TOWNS = [
  { n: "Conza della Campania", lat: 40.8706, lon: 15.3308, r: 1, note: "Vicina all'epicentro. Intensità X MCS: l'abitato fu evacuato e i pochi edifici rimasti in piedi furono demoliti." },
  { n: "Lioni", lat: 40.878, lon: 15.1895, r: 1, note: "Distrutta. Intensità X MCS, tra i sei comuni con i massimi effetti." },
  { n: "Sant'Angelo dei Lombardi", lat: 40.9277, lon: 15.1777, r: 1, note: "Circa 300 morti, tra cui 27 bambini di un orfanotrofio. L'80% del paese distrutto." },
  { n: "Teora", lat: 40.8458, lon: 15.2542, r: 2, note: "Tra i tre comuni dell'epicentro. Distrutta." },
  { n: "Castelnuovo di Conza", lat: 40.8117, lon: 15.3367, r: 2, note: "Tra i comuni più duramente colpiti, vicino all'epicentro." },
  { n: "Laviano", lat: 40.7868, lon: 15.3092, r: 1, note: "Tra i comuni più duramente colpiti, in provincia di Salerno." },
  { n: "Santomenna", lat: 40.74, lon: 15.22, r: 0, note: "Comune del cratere, tra i più colpiti." },
  { n: "Senerchia", lat: 40.7714, lon: 15.1836, r: 0, note: "Comune del cratere, tra i più colpiti." },
  { n: "Balvano", lat: 40.6492, lon: 15.5042, r: 1, note: "Durante la messa crolla la chiesa di Santa Maria Assunta: tra 66 e 77 morti secondo le fonti, in gran parte bambini e ragazzi." },
  { n: "Muro Lucano", lat: 40.7517, lon: 15.4856, r: 2, note: "Quasi rasa al suolo. In tutta la Basilicata le vittime furono circa 140." },
  { n: "Calitri", lat: 40.9006, lon: 15.4425, r: 2, note: "Gravemente danneggiata." },
  { n: "Bisaccia", lat: 41.0092, lon: 15.3733, r: 2, note: "Gravemente danneggiata." },
  { n: "Napoli", lat: 40.8518, lon: 14.2681, r: 1, city: 1, note: "A 80 km dall'epicentro. In via Stadera, a Poggioreale, crolla un palazzo: 52 morti." },
  { n: "Salerno", lat: 40.6824, lon: 14.7681, r: 1, city: 1, note: "Fuori dal cratere, ma la scossa è forte." },
  { n: "Avellino", lat: 40.9146, lon: 14.7906, r: 1, city: 1, note: "Capoluogo della provincia più devastata: 119 comuni irpini colpiti." },
  { n: "Benevento", lat: 41.1297, lon: 14.7826, r: 1, city: 1, note: "Una delle otto province coinvolte." },
  { n: "Potenza", lat: 40.6404, lon: 15.8038, r: 1, city: 1, note: "Provincia coinvolta. In Basilicata i morti furono circa 140." }
];
/* Edificio di via Stadera (Napoli, Poggioreale) */
const STADERA = { lat: 40.858, lon: 14.296 };

/* Soccorsi: partenza, arrivo (simbolici) */
const CONVOYS = [["Salerno","Laviano"],["Avellino","Sant'Angelo dei Lombardi"],["Napoli","Lioni"],["Potenza","Balvano"],["Avellino","Conza della Campania"]];

const EVENTS = [
  { t: 0,   c: "19:34:52", h: "Prima rottura", x: "La faglia si spezza a circa 12 km di profondità, tra Teora, Conza e Castelnuovo. Partono le onde P, poi le S, più lente e distruttive." },
  { t: 20,  c: "+20 s", h: "Seconda rottura", x: "Si attiva un secondo segmento verso sud-est, in direzione della piana di San Gregorio Magno." },
  { t: 40,  c: "+40 s", h: "Terza rottura", x: "Si rompe un terzo segmento, a nord-est del primo. La frattura arriva in superficie: una scarpata visibile per 35–38 km." },
  { t: 52,  c: "+52 s", h: "La scossa continua", x: "Le onde dei tre sottoeventi si sovrappongono. È domenica sera e molti sono in casa o a messa. Le fonti riportano circa 90 secondi di scossa." },
  { t: 90,  c: "19:36", h: "Fine della scossa", x: "Le luci si spengono. Interi paesi restano isolati per giorni." },
  { t: 104, c: "24 nov", h: "La conta dei morti", x: "I soccorsi faticano a raggiungere i paesi del cratere. Il bilancio sale di ora in ora." },
  { t: 118, c: "25 nov", h: "Pertini nel cratere", x: "Il presidente Pertini arriva in elicottero, nonostante il parere contrario di governo e consiglieri." },
  { t: 132, c: "26 nov", h: "«Fate presto»", x: "Il titolo de Il Mattino denuncia la lentezza dei soccorsi. Si organizza la macchina dell'emergenza, con il commissario Zamberletti." },
  { t: 144, c: "Bilancio", h: "Bilancio accertato", x: "Circa 3.000 morti, quasi 9.000 feriti, 280.000 sfollati. Il 74% dei fabbricati dei comuni colpiti risulta danneggiato." }
];

const FINAL = { crolle: 75000, gravi: 275000, lievi: 480000, morti: 2914, feriti: 8848, sfollati: 280000 };
