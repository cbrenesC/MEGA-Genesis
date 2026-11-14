# LAUNCH_CHANGES — Módulo de Lanzamiento (Launch)

## 1. Resumen

Se reemplazó el minijuego arcade de lanzamiento por un **módulo de diseño de lanzamiento** con consecuencias para el resto de la misión. El jugador recibe masa/tamaño de la nave, órbita objetivo, presupuesto y dificultad; elige un lanzador de un catálogo de 8; el motor verifica **masa vs. capacidad a esa órbita, alcance de órbita, sitio/inclinación, cofia, presupuesto y plazo**; muestra el **margen de masa** (verde/amarillo/rojo) con "¿por qué?" y, si no es compatible, explica la causa y sugiere salidas (otro lanzador, quitar instrumentos, menos combustible → menos vida útil, otra órbita). Una tabla de **trade study** compara opciones. Después se **simula** el lanzamiento (7 fases animadas en Canvas) con eventos aleatorios ponderados por la confiabilidad, y se **publica un resultado** (éxito / parcial / falla + órbita alcanzada, costo, combustible y vida perdidos) para el siguiente módulo. Incluye panel de recursos, modo equipo por roles, 3 niveles de dificultad, glosario con tooltips y comparación con misiones reales de NASA/ESA. La lógica es pura y está cubierta por 18 pruebas (`node:test`). Cero dependencias nuevas.

## 2. Rama

- Rama: **`feature/launch`**, creada desde **`main`** (commit base `1e0396d`). El repo solo tenía `main`, por lo que no había otra convención de nombres.
- No se hizo merge ni push a `main`. (La rama está solo en local hasta que se solicite el push.)

**Decisión sobre la carpeta `launch/`:** el repo no tenía una carpeta `launch/` en la raíz. El módulo de lanzamiento existente era `public/games/launch/` (cada módulo es una página estática en `public/games/<nombre>/`, enlazada desde el menú del mapa en `index.html`). Se usó **esa carpeta** como `launch/`: así Vite/Netlify la sirven sin tocar configuración ni el menú. Fuera de ella solo se creó este informe (verificado con `git diff --name-only main..HEAD`).

## 3. Archivos (todo dentro de `public/games/launch/`)

| Archivo | Estado | Descripción |
|---|---|---|
| `index.html` | **modificado** (reescrito) | Página del módulo: esqueleto de secciones (misión, catálogo, informe, comparación, lanzamiento, resultado) y panel lateral. |
| `arcade.html` | **renombrado** desde `index.html` (contenido idéntico) | Minijuego arcade anterior, conservado sin cambios para no perder funcionalidad. Enlazado desde el panel de práctica. |
| `data/launchers.json` | nuevo | Catálogo de 8 lanzadores con capacidades por órbita, costo, confiabilidad, cofia, sitios, plazo, fuentes y campos estimados. |
| `data/config.json` | nuevo | Órbitas, sitios, parámetros físicos, umbrales de margen, dificultad, eventos aleatorios, fases del lanzamiento (con texto educativo) y roles. |
| `data/reference-missions.json` | nuevo | 10 misiones reales (masas aproximadas) para "tu lanzamiento se parece a…". |
| `data/glossary.json` | nuevo | Definiciones simples y "por qué importa" (tooltips y ¿por qué?). |
| `js/engine.js` | nuevo | Motor de reglas puro: capacidad, compatibilidad, margen, confiabilidad, sugerencias, simulación con semilla, línea de tiempo, formato de salida. |
| `js/data.js` | nuevo | Carga de los JSON (inyectable: `fetch` en navegador, `fs` en pruebas). |
| `js/integration.js` | nuevo | **Única** capa que lee la entrada y publica la salida; aislada para reemplazarla fácil. |
| `js/mock.js` | nuevo | 6 misiones de ejemplo que simulan lo que enviarán otros módulos. |
| `js/ui.js` | nuevo | Render HTML de cada sección, barras, tooltips, tabla, equipo, resultado. |
| `js/sequence.js` | nuevo | Animación Canvas 2D de las fases (ascenso, separaciones, vista orbital planeada vs. lograda, explosión). |
| `js/main.js` | nuevo | Estado, eventos, orquestación, votación del equipo, lanzamiento y confirmación. |
| `css/launch.css` | nuevo | Estilos (paleta heredada del minijuego original), responsivo, `prefers-reduced-motion`. |
| `tests/engine.test.mjs` | nuevo | 18 pruebas del motor. |

Eliminados: ninguno (el `index.html` original se movió a `arcade.html`).

## 4. Detalle de cambios

- **Catálogo de lanzadores:** datos fuera de la lógica (`launchers.json`); agregar un lanzador es agregar un objeto. Las cifras se muestran como "simplificadas y aproximadas" y cada ficha lista sus fuentes y campos estimados.
- **Verificación de compatibilidad (`checkCompatibility`):** produce una lista de verificaciones `ok/warn/fail`, cada una con título, detalle y un `why` en lenguaje simple. Un `fail` bloquea el lanzamiento, pero la tarjeta sigue siendo seleccionable para leer el motivo.
- **Sugerencias:** si falla masa → quitar instrumentos (elige los más pesados que cubran el faltante; se asigna al rol Ciencia), reducir combustible (con los años de vida que cuesta; rol Nave), otros lanzadores compatibles (con botones para saltar a ellos) y otras órbitas en las que sí cabría. Si todo cabe, también enseña: margen justo, lanzador sobredimensionado y cuánto combustible extra (y años de vida) permite el margen sobrante.
- **Recursos:** el panel lateral muestra presupuesto, margen de masa, probabilidad de éxito, plazo y, tras lanzar, vida útil restante, combustible y costos extra.
- **Simulación:** `simulateLaunch` usa una semilla (mismo seed = mismo lanzamiento) y un orden fijo de tiradas.
- **Secuencia:** 7 fases (cuenta regresiva, despegue, Max-Q, separación de etapas, de cofia, inserción, despliegue) con texto educativo por fase; si hay falla, la secuencia se corta en la fase del fallo y explota; botón "saltar".
- **Modo equipo:** 4 roles (Launch/Mission Planning decide; Nave, Ciencia, Comunicaciones ven avisos automáticos de la decisión y votan "de acuerdo/objeción" con nota). Los votos viajan en la salida (`team_review`).
- **Dificultad:** ver §6.
- **Accesibilidad:** semáforo con icono + texto (no solo color), `aria-live` en el subtítulo de la secuencia, foco visible, tabla navegable con teclado, animación acortada con `prefers-reduced-motion`.

## 5. Datos usados

Costos en M$ (millones de USD). Capacidades en kg (LEO / SSO / GTO / TLI; `—` = no puede). **Todo es aproximado**; "est." = estimación del equipo (no publicada por el fabricante). El campo `estimated_fields` de cada lanzador en el JSON marca exactamente cuáles.

| Lanzador (inspirado en) | LEO | SSO | GTO | TLI | Costo | Confiab. | Cofia útil Ø×alt (m) | Sitio(s) | Plazo | Fuente principal |
|---|---|---|---|---|---|---|---|---|---|---|
| Rideshare SSO (SpaceX Transporter) — **ficticio** | — | 250 (est.) | — | — | por kg: 6 500 US$/kg, mín. 0,3 | 0,98 (est.) | 0,7 × 1,0 | Vandenberg | 6 m | Precio publicado del programa Rideshare de SpaceX; cuota por cliente inventada |
| Electron (Rocket Lab) | 300 | 200 | — | 20 (est.) | 7,5 | 0,91 | 1,05 × 2,4 (alt. est.) | Mahia | 8 m | Payload User's Guide de Rocket Lab; CAPSTONE como referencia TLI |
| Alpha (Firefly) | 1 030 | 630 | — | — | 15 | 0,72 (est.) | 1,8 × 3,6 (alt. est.) | Vandenberg | 10 m | Payload User's Guide de Firefly; confiabilidad estimada del historial |
| Vega C (Arianespace/Avio) | 3 300 | 2 200 | — | — | 38 (~€35 M) | 0,92 (est.) | 3,0 × 7,5 (est.) | Kourou | 12 m | Manual de usuario de Vega C |
| Falcon 9 (SpaceX) | 17 500 | 8 000 (est.) | 5 500 | 3 500 (est.) | 70 | 0,99 | 4,6 × 11,0 (alt. est.) | Cabo Cañaveral, Vandenberg | 6 m | Guía/página pública de SpaceX (cifras con recuperación de 1.ª etapa) |
| Ariane 6 A64 (ArianeGroup) | 21 650 | 14 500 (est.) | 11 500 | 8 600 (est.) | 130 (~€115 M) | 0,95 (est.) | 4,6 × 14,0 (alt. est.) | Kourou | 18 m | Manual de usuario de Ariane 6 |
| Falcon Heavy (SpaceX) | 63 800 | 35 000 (est.) | 26 700 | 18 000 (est.) | 100 | 0,97 (est.) | 4,6 × 11,0 (alt. est.) | Cabo Cañaveral | 15 m | Página pública de Falcon Heavy (versión desechable) |
| SLS Block 1 (NASA) | 95 000 | — | — | 27 000 | 2 200 | 0,94 (est.) | 5,0 × 17,0 (est.) | Cabo Cañaveral | 36 m | SLS Reference Guide; costo del informe OIG de NASA (2022) |

Fuentes completas, notas de confiabilidad y campos estimados por lanzador: `data/launchers.json`. Además: sitios y órbitas en `data/config.json` (latitudes reales; delta-v desde el suelo redondeados: LEO 9,4 / SSO 9,7 / GTO 10,3 / TLI 12,5 km/s). Misiones de referencia (masas redondeadas): `data/reference-missions.json`.

> Nota: en `reference-missions.json`, `launcher_id` es el lanzador **del juego** más parecido; `real_launcher` es el que usó la misión real (p. ej. Landsat 9 usó Atlas V, que no está en el catálogo).

## 6. Fórmulas y reglas del juego

Todos los parámetros numéricos están en `data/config.json`.

- **Masa a lanzar:** `payload = masa_nave + adaptador`, con `adaptador = max(2 kg, 3 % × masa_nave)`.
- **Capacidad ajustada:** `capacidad = base(órbita) × f_sitio × f_plano`.
  - `f_sitio = 1 + 0,35 × (v_rot(lat_sitio) − v_rot(lat_sitio_referencia))` con `v_rot = 0,465·cos(lat)` km/s; solo si el sitio difiere del de referencia y la órbita no es SSO.
  - `f_plano = max(0,4; 1 − 0,02 × (lat − inc_efectiva))` si la inclinación efectiva (`inc>90 → 180−inc`) es menor que la latitud del sitio; si no, 1.
  - Si el sitio no permite esa órbita (`orbits_allowed`) o el lanzador no tiene cifra para ella → **fallo** "no puede alcanzarla".
- **Margen de masa:** `margen_kg = capacidad − payload`; `margen_% = margen_kg / payload × 100`; `uso_% = payload / capacidad`.
  - 🟢 verde: ≥ 15 % · 🟡 amarillo: 0–15 % (compatible, poca holgura) · 🔴 rojo: < 0 (bloquea).
- **Cofia:** la nave (Ø, alto) debe caber en el espacio útil (Ø, alto) del lanzador.
- **Costo:** fijo, o `max(mínimo, usd_por_kg × masa_nave / 10⁶)` en el rideshare. Falla si `costo > presupuesto`; aviso si > 60 % del presupuesto.
- **Plazo:** aviso si `plazo_reserva > fecha_límite`; **bloquea solo en dificultad difícil**.
- **Confiabilidad efectiva:** `rel_ef = rel × (1 − 0,04 × clamp((10 − margen_%)/10, 0, 1))` (un margen < 10 % resta hasta 4 puntos).
- **Probabilidad de falla total:** `p_falla = clamp((1 − rel_ef) × escala_falla, 0, 0,95)`; `P(éxito) = 1 − p_falla`.
- **Eventos aleatorios** (`escala_evento` según dificultad), tirados en este orden:
  1. **Clima** (cuenta regresiva): `p = clamp(prob_clima_sitio × escala_evento, 0, 0,8)`. Retraso 2–10 días × `delay_multiplier` del lanzador; costo extra = `costo × 0,004 × días`. No cambia el resultado (sigue "éxito").
  2. **Falla** (`p_falla`): misión perdida; fase del fallo por pesos (despegue 10 %, Max-Q 20 %, etapas 25 %, cofia 10 %, inserción 35 %). Termina el lanzamiento.
  3. **Anomalía menor**: `p = min(0,45; (1 − rel) × 2 × escala_evento)`. Pierde 5–15 % del combustible → `vida_perdida = vida_diseño × combustible_perdido / combustible`. Resultado **parcial**.
  4. **Órbita distinta**: `p = min(0,40; (1 − rel) × 1,5 × escala_evento)`. Altitud −5 a −15 %, inclinación +0,1 a +0,6°, corrección = 8–20 % del combustible. Resultado **parcial**.
- **Estado final:** `failure` (hubo falla), `partial` (hubo anomalía u órbita distinta), `success` (solo clima o nada).
- **Dificultad:**

| | Fácil | Normal | Difícil |
|---|---|---|---|
| Catálogo | 5 lanzadores (sin Alpha, Ariane 6, SLS) | 8 | 8 |
| Sitio de lanzamiento | automático (mejor) | elegible | elegible |
| Inclinación (LEO) | fija | fija | elegible (0–90°) |
| Escala de falla / eventos | ×0,5 / ×0,5 | ×1 / ×1 | ×1,25 / ×1,5 |
| Eventos activos | clima, anomalía | + órbita distinta | + órbita distinta |
| Fecha límite | aviso | aviso | **bloquea** |
| Modo guiado y "Recomendado" | sí | no | no |

- **Etiquetas de compromiso** en la tabla: "Más barato", "Más seguro", "Más margen" entre las compatibles (no hay una única mejor).

## 7. Interfaz con otros módulos

No existe hoy estado compartido entre módulos (cada módulo es una página independiente). Se propone esta convención, **aislada en `js/integration.js`** para que sea trivial cambiarla:

**Entrada** — `window.MissionState.get()` (si existe) o `localStorage['spacemission.mission']` (JSON). Si falta o es inválida se usan mocks.

```jsonc
{
  "spacecraft": {
    "name": "Observatorio Polar",          // string (opcional)
    "mass_kg": 1800,                        // number > 0, masa TOTAL con combustible e instrumentos
    "fuel_kg": 300,                         // number (opcional; habilita pérdida de vida y sugerencias)
    "design_life_years": 5,                 // number (opcional)
    "dimensions": { "diameter_m": 2.4, "height_m": 4.5 },   // opcional (si falta no se verifica cofia)
    "instruments": [ { "id": "radar", "name": "Radar", "mass_kg": 420 } ]  // opcional (sugerencias)
  },
  "target_orbit": { "id": "SSO", "inclination_deg": 98.2 }, // id: "LEO"|"SSO"|"GTO"|"TLI"; inclination_deg opcional
  "budget_musd": 90,                         // number, presupuesto DISPONIBLE en millones de USD
  "deadline_months": 24,                     // number|null
  "difficulty": "normal",                    // "easy"|"normal"|"hard"
  "seed": 12345                              // opcional, para reproducir un lanzamiento
}
```

**Salida** — `localStorage['spacemission.launch']`, `window.MissionState.set('launch', …)` si existe, evento `window` `spacemission:launch-result` y `postMessage({type:'spacemission:launch-result', payload})` al padre (si está en iframe). Se publica al pulsar **"Confirmar y enviar al siguiente módulo"**. Los votos del equipo se guardan localmente en `spacemission.launch.team`.

```jsonc
{
  "version": 1, "module": "launch",
  "status": "success",                      // "success" | "partial" | "failure"
  "mission_lost": false,
  "launcher": { "id": "vega_c", "name": "Vega C" },
  "site": { "id": "kourou", "name": "Kourou, Guayana Francesa" },
  "cost_musd": 38,                          // total (incluye extras por eventos)
  "cost_breakdown": { "launch_musd": 38, "extra_musd": 0 },
  "budget_remaining_musd": 52,              // → el módulo de presupuesto debe descontar cost_musd
  "target_orbit": { "id": "SSO", "altitude_km": 700, "inclination_deg": 98.2 },
  "achieved_orbit": { "id": "SSO", "altitude_km": 700, "inclination_deg": 98.2, "deviation_pct": 0 },  // null si falla
  "delay_days": 0,
  "spacecraft_delta": { "fuel_lost_kg": 0, "life_lost_years": 0, "remaining_fuel_kg": 300, "remaining_life_years": 5 },
  "mass": { "spacecraft_kg": 1800, "adapter_kg": 54, "payload_kg": 1854, "capacity_kg": 2200, "base_capacity_kg": 2200,
            "margin_kg": 346, "margin_pct": 18.7, "usage_pct": 84, "level": "green" },
  "reliability": { "base": 0.92, "effective": 0.92, "p_fail": 0.08, "p_success": 0.92 },
  "events": [ { "id": "minor_anomaly", "phase": "max_q", "severity": "moderate", "effect": { "fuel_lost_kg": 24, "fuel_lost_pct": 8 } } ],
  "team_review": { "science": { "vote": "object", "note": "…" } },   // null si nadie votó
  "seed": 1731612345
}
```

## 8. Dependencias nuevas

**Ninguna.** JavaScript nativo (módulos ES), Canvas 2D y `node:test` (incluido en Node) para las pruebas. No se modificó `package.json`.

## 9. Cómo probarlo

```bash
npm install
npm run dev          # abre http://localhost:3000/games/launch/
```

También está en el menú del mapa → "01 · Lanzamiento espacial". Parámetros útiles: `?difficulty=easy|normal|hard&preset=cubesat|smallsat|science|geosat|lunar|telescope`.

Pruebas del motor (sin instalar nada):

```bash
node --test public/games/launch/tests/engine.test.mjs
```

Recorrido sugerido: preset `science` → elegir **Electron** (rojo, explica y sugiere) → **Vega C** (verde) → comparar en la tabla → votar con un rol "Objeción" → **Iniciar lanzamiento** → confirmar. Con `difficulty=hard&preset=geosat` aparecen sitio e inclinación.

Verificado en esta sesión: 18/18 pruebas; flujo completo en Chromium (escritorio) sin errores de consola; modos fácil/difícil y ancho de 390 px sin desbordamiento horizontal. **No se ejecutó `npm run build`** (no se instalaron dependencias en la sesión); al estar en `public/`, Vite copia la carpeta tal cual.

## 10. Mocks y supuestos temporales

- `js/mock.js`: 6 misiones de práctica (nave, órbita, presupuesto, fecha límite). Se usan cuando no hay entrada válida y activan el "Panel de práctica" (cambiar misión, dificultad, masa, presupuesto, órbita).
- Se asume que `mass_kg` es la masa **total** (seca + combustible + instrumentos) y que `fuel_kg` está incluido en ella.
- Se asume una sola nave y una sola órbita objetivo; inclinación de LEO = 51,6° por defecto.
- El "modo equipo" es **local** (mismo navegador): no hay multijugador en el repo.
- El rol del jugador está fijado a "Launch / Mission Planning".
- Sin lógica real de ventanas de lanzamiento (ver §12).

## 11. Cambios sugeridos fuera de `launch/` (NO implementados)

1. **Estado compartido de misión:** definir un `MissionState` común (o adoptar la convención de §7) para que los módulos de nave/instrumentos/órbita/presupuesto escriban `spacemission.mission` y el módulo de presupuesto lea `spacemission.launch.budget_remaining_musd`.
2. **Módulo de nave/instrumentos:** exponer `mass_kg` total, `fuel_kg`, `dimensions` plegadas, `design_life_years` y la lista de `instruments` con masas.
3. **Módulo de órbita:** exponer `target_orbit.id` (LEO/SSO/GTO/TLI) y, si aplica, `inclination_deg`; consumir `achieved_orbit` y `spacecraft_delta` (combustible/vida restantes) del resultado del lanzamiento.
4. **Panel de recursos global:** hoy el módulo trae el suyo (lateral). Convendría un panel compartido que lea `cost_musd`, `mass.margin_kg`, `reliability.p_success`.
5. **Sistema de roles/multijugador:** si se implementa, conectar `team_review` y las votaciones de este módulo a ese sistema y mostrar el aviso de masa al rol de Nave/Ciencia.
6. **Menú del mapa** (`index.html` raíz): el enlace actual ya apunta a `/games/launch/`; si se quiere dar acceso al arcade, enlazar `/games/launch/arcade.html`.
7. **Netlify:** el redirect `/*` → `/index.html` (status 200) puede capturar rutas no estáticas; las de `/games/launch/` funcionan porque son archivos reales.

## 12. Pendientes, limitaciones e ideas

- Las cifras son aproximadas y el modelo es una simplificación (no usa la ecuación del cohete ni trayectorias reales; GMAT no se integró).
- La **ventana de lanzamiento** está solo como concepto (días de retraso por clima y plazo de reserva); no se calcula alineación con la órbita.
- La capacidad no distingue versión desechable/recuperable ni altitud exacta de la órbita.
- Los márgenes y probabilidades son parámetros de juego, no estadística rigurosa (Ariane 6, SLS, Alpha tienen pocos vuelos).
- Un solo CubeSat/nave por rideshare; no hay lanzamientos compartidos con varias naves del jugador.
- Ideas: gráfica de capacidad vs. órbita por lanzador; "Mission Viz" de la trayectoria; reintentos con costo de seguro; vista de cofia con la nave dibujada; sonido; probar más navegadores/dispositivos y lectores de pantalla (solo se probó Chromium).

## 13. Commits (`main..feature/launch`)

```
b028c31 launch: mover minijuego previo a arcade.html y agregar datos del catálogo
20bfa2b launch: motor de reglas, mocks y pruebas
72fb2f2 launch: interfaz, secuencia animada e integración con mocks
(siguiente) launch: agregar informe LAUNCH_CHANGES.md
```
