import { useEffect, useReducer, useRef, useState } from "react";
import { Engine } from "reactylon/web";
import { Scene } from "reactylon";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color4 } from "@babylonjs/core/Maths/math.color.js";
import Quake from "./Quake.jsx";
import { D, sim, T1, TMAX, AOFF, smooth, roman } from "./model.js";

const fmt = n => Math.round(n).toLocaleString("it-IT");
const CENTER = new Vector3(5, 0, 5);

export default function App() {
  const [dem, setDem] = useState(null), [err, setErr] = useState(null);
  const [, bump] = useReducer(x => x + 1, 0);
  const snd = useRef(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    fetch("dem.bin").then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(b => setDem(new Int16Array(b))).catch(() => setErr("Non riesco a caricare i dati del rilievo."));
    sim.emit = bump;
    /* orologio della simulazione: avanza qui, la scena lo legge a ogni frame */
    let last = performance.now(), raf, tick = 0;
    const loop = now => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (sim.playing) { sim.T += dt * sim.speed; if (sim.T >= TMAX) { sim.T = TMAX; sim.playing = false; } }
      const a = snd.current;
      if (a) {
        if (!sim.audioOn || !sim.playing || sim.T >= T1 || sim.T + AOFF >= (a.duration || 99)) { if (!a.paused) a.pause(); }
        else {
          if (a.playbackRate !== sim.speed) a.playbackRate = sim.speed;
          if (Math.abs(a.currentTime - (sim.T + AOFF)) > 0.35) a.currentTime = sim.T + AOFF;
          if (a.paused) a.play().catch(() => {});
        }
      }
      if (++tick % 6 === 0) bump();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const set = o => { Object.assign(sim, o); bump(); };
  const T = sim.T;
  let ev = D.EVENTS[0]; D.EVENTS.forEach(e => { if (T >= e.t) ev = e; });
  const g = smooth((T - 6) / 84), h = smooth((T - 92) / 52);
  const clock = T < T1 ? `19:34:52 + ${Math.floor(T)} s` : ev.c === "19:36" ? "23 nov, 19:36" : "dopo · " + ev.c;

  return (
    <div className="app">
      <div className="stage">
        {dem && (
          <Engine forceWebGL engineOptions={{ antialias: true, adaptToDeviceRatio: true, stencil: true }}>
            <Scene onSceneReady={s => { s.clearColor = new Color4(.043, .067, .09, 1); }}>
              <arcRotateCamera name="camera" alpha={-1.85} beta={0.95} radius={140} target={CENTER} />
              <hemisphericLight name="cielo" direction={new Vector3(0.2, 1, 0.1)} intensity={1.0} />
              <directionalLight name="sole" direction={new Vector3(0.5, -0.8, 0.9)} intensity={0.9} />
              <Quake dem={dem} />
            </Scene>
          </Engine>
        )}
        {!sim.ready && <div className="loading">{err || "Carico il rilievo dell'Irpinia…"}</div>}
      </div>

      <header className="top">
        <a className="back" href="../">← Mappa 2D</a>
        <h1>Irpinia 1980 · Vista 3D</h1>
      </header>

      {sim.sel && (
        <aside className="town">
          <button className="x" type="button" aria-label="Chiudi" onClick={() => sim.select?.(null)}>×</button>
          <h3>{sim.sel.n}</h3>
          <p className="mcs">Intensità stimata dal modello: <b>{roman(sim.sel.I)} MCS</b></p>
          <p>{sim.sel.note}</p>
        </aside>
      )}

      <section className={"panel" + (more ? " more" : "")}>
        <div className="ev" aria-live="polite">
          <div className="phase">{T < T1 ? "Atto 1 · i 90 secondi, in tempo reale" : "Atto 2 · le ore e i giorni dopo, in tempo accelerato"}</div>
          <h2>{ev.h}<button className="more-btn" type="button" aria-expanded={more} onClick={() => setMore(!more)}>{more ? "Meno" : "Dettagli"}</button></h2>
          <p>{ev.x}</p>
        </div>
        <div className="scrub">
          <input type="range" min="0" max={TMAX} step="0.1" value={T} aria-label="Scorri la simulazione"
            onChange={e => set({ T: +e.target.value, playing: false })} />
          <div className="timeline"><span className="clock">{clock}</span>
            <span>crolli {fmt(D.FINAL.crolle * g)} · morti {h > 0 ? fmt(D.FINAL.morti * h) : "—"}</span></div>
        </div>
        <div className="bar">
          <button className="play" type="button" onClick={() => set(sim.T >= TMAX ? { T: 0, playing: true } : { playing: !sim.playing })}>
            {sim.playing ? "Pausa" : T >= TMAX ? "Rivedi" : "Riprendi"}</button>
          <button type="button" onClick={() => set({ T: 0, playing: true })}>Da capo</button>
          {[1, 2, 4].map(s => <button key={s} type="button" aria-pressed={sim.speed === s} onClick={() => set({ speed: s })}>{s}×</button>)}
        </div>
        <div className="bar">
          <button type="button" aria-pressed={sim.tour} onClick={() => set({ tour: !sim.tour })}>Visita guidata</button>
          <button type="button" aria-pressed={sim.subsoil} onClick={() => set({ subsoil: !sim.subsoil, tour: false })}>Sottosuolo</button>
          <button type="button" aria-pressed={sim.intensity} onClick={() => set({ intensity: !sim.intensity })}>Intensità</button>
          <button className="audio" type="button" aria-pressed={sim.audioOn}
            onClick={() => set(sim.audioOn ? { audioOn: false } : { audioOn: true, playing: true, T: sim.T >= T1 ? 0 : sim.T })}>
            {sim.audioOn ? "Audio Radio Alfa ✓" : "Audio Radio Alfa"}</button>
          {sim.xr.vr && <button type="button" onClick={() => sim.xr.enter("immersive-vr")}>Entra in VR</button>}
          {sim.xr.ar && <button type="button" onClick={() => sim.xr.enter("immersive-ar")}>Vedi in AR</button>}
        </div>
        <p className="hint">Trascina per ruotare, rotella o pizzico per lo zoom, due dita o tasto destro per spostarti. Tocca un paese per la sua storia.
          Rilievo reale esagerato 3 volte in altezza; faglie, onde e case sono illustrative. Audio originale di Radio Alfa.</p>
      </section>
      <audio ref={snd} src="../audio.mp3" preload="auto" />
    </div>
  );
}
