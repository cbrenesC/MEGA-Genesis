# LAUNCH_CHANGES — Módulo de Lanzamiento (Space Mission · NASA Space Apps)

## 1. Resumen

- Se construyó el módulo **LAUNCH** (segmento de lanzamiento) como una página de 5 pasos: **Misión → Lanzador → Compatibilidad → Lanzamiento → Resultado**.
- Hay un **catálogo de 10 lanzadores** (desde Electron y el viaje compartido hasta Falcon Heavy y SLS). Sus cifras están en JSON, con la fuente y la calidad de cada dato, y la interfaz las marca como **simplificadas/aproximadas**.
- La **verificación de compatibilidad** comprueba el destino, la inclinación según la latitud del sitio, la masa y el margen (semáforo verde/amarillo/rojo), el volumen de la cofia, la confiabilidad, el presupuesto y el calendario o ventana. Cada punto trae su "¿por qué?" y, si falla, **sugerencias concretas** con el rol responsable.
- **Consecuencias en los recursos:** el costo se descuenta del presupuesto compartido, los retrasos cuestan dinero, la confiabilidad pesa en la simulación, y cargar menos combustible o lanzar lejos del ecuador (a GTO) reduce la vida útil.
- La **secuencia de lanzamiento animada** (canvas) recorre 7 fases. Los eventos aleatorios dependen de la confiabilidad, usan una semilla reproducible y producen un resultado de **éxito, éxito parcial o falla** con la órbita alcanzada.
- Hay **valor educativo** en todo el módulo: un glosario con botones "?", barras de Δv por destino, una tabla de compromisos (*trade study*) con etiquetas "más barato / más confiable / más margen / sale antes" y una comparación con **misiones reales de NASA**.
- En **modo equipo**, los roles afectados dan su visto bueno antes de confirmar, se pueden escribir notas y el módulo deja pedidos para otros roles en el estado compartido.
- Hay **tres dificultades** (fácil, normal y difícil) con distinto catálogo y distintas variables.
- Hay **18 pruebas automáticas** del motor de reglas, sin dependencias nuevas.

## 2. Rama

- Rama de trabajo: **`feature/launch`**. Sigue la convención del repo (`feature/two-space-minigames`).
- Rama de origen: **`main`** (commit `d61dfc5`).
- No se hizo merge ni push.
- Durante el trabajo, `main` local avanzó 6 commits (loader, title screen y otros cambios del hub, que no tocan `public/games/launch/`). La rama sigue basada en `d61dfc5`. Se comprobó con `git merge-tree` que se integra **sin conflictos**, y el nuevo `main` sigue enlazando a `/games/launch/`.

### Nota sobre la carpeta `launch/`

El repositorio no tiene una carpeta `launch/` en la raíz. El módulo de lanzamiento existente vive en **`public/games/launch/`**, la ruta a la que enlaza el hub (`/games/launch/`). Por eso todo el trabajo se hizo **solo dentro de `public/games/launch/`**. Esa es la única ubicación que Vite copia al build y que Netlify sirve sin tocar la configuración. Además se creó este informe en la raíz, que es la excepción permitida. No se modificó ningún archivo fuera de esas dos ubicaciones.

## 3. Archivos (todos dentro de `public/games/launch/`)

| Archivo | Estado | Descripción |
|---|---|---|
| `index.html` | **Modificado** (reemplazado) | Antes era el minijuego de empuje y ángulo. Ahora es la página del módulo LAUNCH, con 5 pasos y un panel de recursos. |
| `practica-ascenso.html` | **Creado** (movido con `git mv` desde `index.html`) | El minijuego anterior, conservado sin cambios salvo el enlace "volver", que ahora apunta al módulo. Se enlaza desde el pie de página. |
| `styles.css` | Creado | Estilos del módulo con la paleta del complejo (navy, cian, naranja). Es responsivo y respeta `prefers-reduced-motion`. |
| `js/rules.js` | Creado | Motor de reglas puro (sin DOM): física simplificada, compatibilidad, costo, calendario, sugerencias, pedidos, probabilidades, simulación y comparación con misiones NASA. |
| `js/state.js` | Creado | Contrato de entrada/salida: lee el estado compartido, completa con mocks lo que falte y escribe solo la sección `launch`. |
| `js/sequence.js` | Creado | Animación en canvas 2D de la secuencia de lanzamiento (no decide nada: dibuja el resultado ya calculado). |
| `js/main.js` | Creado | Controlador de la interfaz: render de cada paso, eventos, modo equipo, glosario, panel de recursos y entrega del resultado. |
| `data/launchers.json` | Creado | Catálogo de 10 lanzadores con `sources` y `dataQuality` por cifra. |
| `data/sites.json` | Creado | 7 sitios de lanzamiento: latitud, rango de inclinaciones permitido y riesgo de clima. |
| `data/orbits.json` | Creado | 5 destinos (LEO, SSO, GTO, TLI y ESCAPE) con Δv aproximado, explicación simple y ventanas. |
| `data/rules.json` | Creado | Reglas ajustables: umbrales de margen por dificultad, constantes físicas, configuración de cada dificultad y de cada evento. |
| `data/reference-missions.json` | Creado | 19 misiones reales de NASA para la comparación "tu lanzamiento se parece a…". |
| `data/glossary.json` | Creado | 14 explicaciones cortas en lenguaje simple. |
| `data/mock-missions.json` | Creado | **Mocks**: 7 escenarios de misión (CubeSat, smallsat, ecuatorial, océanos, GEO, Luna y Marte). |
| `tests/rules.test.mjs` | Creado | 18 pruebas con `node:test`. |
| `README.md` | Creado | Guía rápida de la carpeta. |

No se eliminó ningún archivo: el minijuego anterior se renombró y se conservó.

## 4. Detalle de cada cambio

### 4.1 Datos separados de la lógica (`data/*.json`)
- **Qué:** todas las cifras (capacidades, costos, confiabilidad, cofias, sitios, Δv, umbrales, probabilidades, costos de eventos) y todos los textos educativos.
- **Por qué:** así es fácil ajustar el balance o agregar lanzadores sin tocar el código, y la fuente de cada cifra queda junto al dato.
- **Cómo:** `state.loadData()` carga los 7 JSON con `fetch`. `rules.js` recibe los datos como parámetro y no contiene cifras de juego escritas a mano.

### 4.2 Motor de reglas (`js/rules.js`)
- `evaluateLauncher(launcher, data, inputs, options)` devuelve una evaluación completa: capacidad efectiva, margen (kg y %), estado del semáforo, costos, fecha, vida útil, probabilidades y una lista `checks` (cada uno con `status` ok/warn/fail, `detail`, `why` y el término del glosario).
- `evaluateAll`, `tradeHighlights` (más barato / más confiable / más margen / sale antes), `buildSuggestions` (alternativas por causa, cada una con su rol) y `buildRequests` (pedidos a otros roles).
- `simulateLaunch(evaluation, data, inputs, { seed, eventsEnabled })`: simulación con semilla (mulberry32). La misma semilla reproduce exactamente el mismo lanzamiento.
- `matchReferenceMission`: busca la misión NASA más parecida (mismo destino y masa más cercana en escala logarítmica).
- **Por qué es puro:** se puede probar con Node, reutilizar desde otros módulos y explicar con exactitud en este informe.

### 4.3 Interfaz (`index.html`, `styles.css`, `js/main.js`)
1. **Misión:** muestra los datos recibidos con una etiqueta **COMPARTIDO** o **MOCK** por dato. Permite elegir el escenario de práctica (solo si hay mocks), la dificultad y el modo equipo.
2. **Lanzador:** explica el destino con barras de Δv de los 5 destinos. Muestra tarjetas de los lanzadores; las incompatibles aparecen **bloqueadas con la causa**, pero se pueden abrir para ver por qué. Incluye el filtro "solo compatibles" y la **tabla de compromisos**.
3. **Compatibilidad:** indicador de margen con zonas verde/amarillo/rojo, dibujo de la nave dentro de la cofia, lista de verificaciones con "¿Por qué?", fuentes del lanzador, selector de sitio (difícil), deslizador para cargar menos combustible (normal y difícil), sugerencias y revisión del equipo. El botón **Confirmar** queda bloqueado si algo falla o si falta un visto bueno.
4. **Lanzamiento:** canvas con fases y telemetría ilustrativa, la probabilidad de cada evento, el interruptor de eventos aleatorios, la semilla, una bitácora en vivo y un botón para saltar la animación.
5. **Resultado:** resultado con explicación, órbita alcanzada, vida útil, costo, presupuesto restante, eventos con su consecuencia y su porqué, misión NASA parecida, pedidos a otros roles, el JSON exacto entregado y los botones "Copiar JSON", **"Comprar otro lanzamiento"** (vuelve a cobrar), "Cambiar de lanzador" y "Reiniciar".
- **Panel de recursos** (siempre visible): presupuesto (otros equipos, lanzador e imprevistos), masa, tiempo, vida útil, confiabilidad y resultado. Indica que potencia, comunicaciones y datos no los afecta el lanzador. Durante la animación no adelanta el resultado.
- **Glosario:** botones "?" que abren una explicación corta. Funcionan con teclado y en pantallas táctiles, y se cierran con Esc o con un clic fuera.

### 4.4 Animación (`js/sequence.js`)
- Fases: cuenta regresiva, despegue, Max-Q (anillo de condensación), separación de etapas (la primera etapa cae), separación de cofia (las mitades se separan), inserción orbital (recuadro con la órbita objetivo y la alcanzada) y despliegue de la nave (paneles que se abren).
- Si hay clima o anomalía, aparece "CUENTA EN ESPERA (HOLD)". Si hay falla, se muestra una explosión y "SE PERDIÓ LA SEÑAL" en la fase sorteada. Si la órbita no es la planeada, el recuadro la marca en amarillo.
- Con `prefers-reduced-motion`, la animación va 3 veces más rápido y no vibra.

### 4.5 Minijuego anterior
Se conservó como `practica-ascenso.html` para no perder el trabajo del otro equipo. El hub sigue enlazando a `/games/launch/`, que ahora es el módulo.

## 5. Datos usados

Todas las cifras están **simplificadas y redondeadas para el juego**. Calidad del dato: **P** = publicada (dato público redondeado), **A** = aproximada (rango público, se eligió un valor), **E** = estimada o ficticia para el juego. La fuente detallada de cada cifra está en `data/launchers.json` → `sources`. La disponibilidad ("primer cupo") es siempre **E** (valor de juego).

| Lanzador | LEO | SSO | GTO | TLI | Escape | Costo (MUSD) | Confiab. | Cofia útil (m) | Cupo (meses) | Sitios |
|---|---|---|---|---|---|---|---|---|---|---|
| Electron | 300 P | 200 P | — | 30 E | — | 7,5 A | 0,92 A | 1,07×1,8 A | 3 | Mahia, Wallops |
| Viaje compartido F9 | 450 A* | 450 A* | — | — | — | 6.500 USD/kg, mín. 0,35 A | 0,99 A | 1,0×1,4 A | 4 | Vandenberg, KSC |
| Pegasus XL | 450 A | 300 A | — | — | — | 56 P | 0,93 A | 1,1×2,1 A | 12 | Kwajalein, KSC, Vandenberg |
| Alpha | 1.030 P | 630 P | — | — | — | 15 A | 0,65 A | 2,0×3,0 A | 6 | Vandenberg |
| PSLV-XL | 3.800 A | 1.750 P | 1.400 P | — | — | 30 A | 0,94 A | 2,9×5,0 A | 9 | Sriharikota |
| Vega C | 3.300 A | 2.300 P | — | — | — | 45 E | 0,88 A | 3,0×6,0 A | 12 | Kourou |
| Falcon 9 (reutilizable) | 17.500 A | 12.000 E | 5.500 A | 3.000 E | 1.500 E | 70 P | 0,99 A | 4,6×11 A | 6 | KSC, Vandenberg |
| Ariane 6 (A64) | 21.600 A | 15.000 E | 11.500 A | 8.600 A | 5.000 E | 125 A | 0,92 E | 4,5×14 A | 12 | Kourou |
| Falcon Heavy (desechable) | 63.800 P | 40.000 E | 26.700 P | 20.000 E | 16.800 P | 150 A | 0,97 E | 4,6×11 A | 18 | KSC |
| SLS (config. de carga) | 95.000 A | — | — | 27.000 A | 20.000 E | 2.200 A | 0,95 E | 7,5×19 **E (ficticia)** | 48 | KSC |

\* En el viaje compartido, la "capacidad" es el límite por cliente (un puerto ESPA Grande), no la del cohete. La órbita es fija: 550 km/45° (LEO) o 525 km/97,5° (SSO).
"SLS (configuración de carga)" está marcado en el juego como **PARCIALMENTE FICTICIO**: la cofia de carga de Block 1B todavía no vuela.

Fuentes principales (resumen; el detalle por cifra está en el JSON): páginas públicas y guías de usuario de Rocket Lab (Electron), SpaceX (Falcon 9, Falcon Heavy y Rideshare), Northrop Grumman (Pegasus), Firefly (Alpha), ISRO (PSLV), ESA/Arianespace (Vega C y Ariane 6) y NASA (SLS Reference Guide); contratos de lanzamiento de NASA (ICON, Psyche, GOES-U, Europa Clipper); NASA OIG IG-22-003 (costo del SLS); historiales públicos de lanzamientos (confiabilidad).

**Otros datos:**
- `sites.json`: latitudes públicas redondeadas. Los rangos de inclinación son **simplificados** y el riesgo de clima es **ficticio**.
- `orbits.json`: Δv desde el suelo con pérdidas incluidas, en valores típicos de libro: LEO 9,4; SSO 9,7; GTO 11,9; TLI 12,5; Escape 13,0 km/s.
- `reference-missions.json`: masas aproximadas de las páginas de cada misión en nasa.gov.
- `rules.json`: todos los valores de juego (umbrales, costos por retraso y por evento, probabilidades) son **de diseño de juego**, no datos reales.

## 6. Fórmulas y reglas del juego

Notación: `C` es la capacidad del lanzador al destino (kg), `m` la masa de la nave al despegar (kg) y `r` la confiabilidad.

**Capacidad efectiva y destino**
- Si `capacityKg[destino]` es `null`, el lanzador no llega al destino → **bloqueado**.
- **Inclinación** (normal y difícil, solo LEO/SSO, no en el viaje compartido): cada sitio tiene un rango `[min, max]`.
  - Si `i_objetivo > max`, no se puede lanzar en esa dirección → **bloqueado**.
  - Si `i_objetivo < min` (la latitud), hay que girar el plano: `Δi = min − i_objetivo`, `Δv = 2·v_LEO·sin(Δi/2)` con `v_LEO = 7,8 km/s`, y `C_ef = C·e^(−Δv/v_e)` con `v_e = 3,33 km/s` (etapa superior con Isp ≈ 340 s). Ejemplo: IXPE desde Florida pasa de 17,5 t a ~5,6 t.
- **Sitio:** en fácil y normal se elige solo (la mayor capacidad efectiva y, a igualdad, el menor riesgo de clima; para GTO, el más cercano al ecuador). En difícil lo elige el jugador.

**Masa y margen**
- `m = masa_nave − combustible_descargado`. Solo se puede descargar combustible **de operación**: `propellantKg − reservedPropellantKg`.
- `margen_kg = C_ef − m` y `margen_% = margen_kg / C_ef · 100`.
- Semáforo (`rules.json → massMargin`):

| Dificultad | Verde | Amarillo | Rojo | Bloqueado |
|---|---|---|---|---|
| Fácil | ≥ 10 % | 3–10 % | 0–3 % | < 0 |
| Normal | ≥ 15 % | 5–15 % | 0–5 % | < 0 |
| Difícil | ≥ 20 % | 8–20 % | 0–8 % | < 0 |

**Cofia:** `diámetro_nave ≤ diámetro_cofia` y `alto_nave ≤ alto_cofia`; si no se cumple → **bloqueado**.

**Confiabilidad:** si `r < 0,9`, se muestra un aviso amarillo ("~1 de cada N falla"). No bloquea, porque aceptar el riesgo es una decisión válida.

**Costo**
- Lanzador dedicado: `costMUSD`. Viaje compartido: `max(minCostMUSD, m · costPerKgUSD / 10⁶)`.
- Calendario: `mes_lanzamiento = primer cupo`. Si el destino tiene ventanas y `everyMonths > 1` (Marte, cada 26 meses), se toma la primera ventana `≥ cupo`.
- `retraso = max(0, mes_lanzamiento − fecha_objetivo)` y `costo_retraso = retraso · delayCostMUSDPerMonth` (fácil 0, normal 1, difícil 2 MUSD/mes).
- `costo_total = lanzador + retraso (+ eventos)`, y `presupuesto_restante = total − comprometido_por_otros − costo_total`. Si queda menos de 0 → **bloqueado**; si queda menos del 5 % del total → aviso.
- "Comprar otro lanzamiento" suma el costo anterior a lo comprometido.

**Vida útil**
- `vida = vida_diseño · (comb_operación − comb_perdido) / comb_operación`.
- El combustible perdido incluye la descarga voluntaria, la penalización GTO y las correcciones de órbita.
- Ecuación del cohete para pasar de Δv a combustible: `kg = m₀·(1 − e^(−Δv/(Isp·g₀)))`.
- **Penalización GTO→GEO** (solo difícil): `Δv(i) = √(v_a² + v_GEO² − 2·v_a·v_GEO·cos i)` con `v_a = 1,6` y `v_GEO = 3,07 km/s`. La nave paga `Δv(latitud) − Δv(0)`: ~360 m/s desde Florida y ~5 m/s desde Kourou.

**Probabilidad de éxito y eventos** (solo los activos en cada dificultad; el interruptor desactiva todos)

| Evento | Probabilidad | Consecuencia |
|---|---|---|
| Retraso por clima (normal, difícil) | `weatherRisk` del sitio (0,15–0,35) | 1–5 días · 0,15 MUSD/día |
| Anomalía menor (difícil) | `min(0,25; 3·(1−r))` | +7 días, +1 MUSD |
| Falla del lanzador (todas) | `1 − r` | Si `rand < partialFailureShare` (0,3 en normal/difícil, 0 en fácil): **falla parcial** en la inserción → la nave pierde 50–80 % de vida útil (o se pierde si no tiene motor). Si no: **falla total** en una fase al azar → misión perdida. |
| Órbita distinta (normal, difícil; solo si no hubo falla) | 0,05 + 0,04 si el margen es amarillo, o + 0,12 si es rojo | Corrección de 15–70 m/s pagada con combustible; sin motor, −25 % de vida útil |

- Probabilidad de que el cohete funcione = `r`. Probabilidad de que no haya ningún imprevisto = `∏(1 − p_evento)`.
- **Resultado:** `falla` si la nave se pierde. `exito_parcial` si hubo falla parcial o si la vida útil cae ≥ 20 % respecto a lo planeado antes del lanzamiento. En los demás casos, `exito`.

## 7. Interfaz con otros módulos

**Mecanismo:** el repo no tenía estado compartido, así que se usa lo mínimo: un objeto JSON en `localStorage["spaceMission.state.v1"]`, dividido en secciones por módulo. LAUNCH **lee** `mission`, `spacecraft`, `orbit`, `budget`, `schedule` y `team`, y **escribe solo** `launch`; las demás secciones se conservan intactas (verificado). Además:
- Se dispara `window` → `CustomEvent("spacemission:launch-updated", { detail: launch })`.
- Se escucha el evento `storage` (cambios hechos en otra pestaña o por otro módulo) para recalcular.

### Entradas (todas opcionales; lo que falte se toma del mock)
```jsonc
{
  "mission":   { "name": "string", "objective": "string", "difficulty": "facil" | "normal" | "dificil" },
  "spacecraft": {                       // del módulo de nave/instrumentos
    "name": "string",
    "massKg": 180,                      // número > 0, OBLIGATORIO para usarse; masa con combustible
    "propellantKg": 15,                 // combustible total (0 = sin motor)
    "reservedPropellantKg": 0,          // combustible imprescindible para llegar a la órbita final
    "ispS": 220,                        // impulso específico del motor de la nave
    "diameterM": 0.9, "heightM": 1.2,   // tamaño plegada (para la cofia)
    "designLifetimeYears": 5,
    "instruments": [ { "id": "ir", "name": "Cámara infrarroja", "massKg": 22 } ]
  },
  "orbit":    { "target": { "type": "LEO" | "SSO" | "GTO" | "TLI" | "ESCAPE", "altitudeKm": 550, "inclinationDeg": 97.6 } },
  "budget":   { "totalMUSD": 60, "committedMUSD": 35 },        // committed = gastado por otros módulos (sin el lanzador)
  "schedule": { "monthsToTargetDate": 6, "nextWindowMonths": 0 },// nextWindowMonths solo importa en ESCAPE
  "team":     { "players": [ { "name": "Ana", "role": "spacecraft" } ] } // roles: launch | spacecraft | science | mission
}
```
Para pruebas, la URL puede forzar los mocks: `?scenario=<id>&difficulty=<nivel>`.

### Salida (`launch`, `schemaVersion: 1`) — ejemplo real generado por el módulo
```jsonc
{
  "schemaVersion": 1, "module": "launch",
  "status": "lanzado",                       // "seleccionado" (lanzador confirmado) | "lanzado"
  "updatedAt": "2026-11-14T18:00:00.000Z",
  "difficulty": "normal",
  "inputSources": { "spacecraft": "mock", "orbit": "mock", "budget": "mock", "schedule": "mock", "difficulty": "jugador" },
  "launcher": { "id": "alpha", "name": "Alpha", "provider": "Firefly Aerospace (EE. UU.)", "fictional": false, "reliability": 0.65 },
  "site": { "id": "vsfb", "name": "Base Vandenberg", "latitudeDeg": 34.7 },
  "cost": { "launchMUSD": 15, "delayMUSD": 0, "eventsMUSD": 0.6, "totalMUSD": 15.6 },
  "budgetAfterMUSD": 9.4,
  "mass": { "spacecraftKg": 180, "launchMassKg": 180, "propellantOffloadKg": 0, "capacityKg": 630, "marginKg": 450, "marginPct": 71.4, "marginStatus": "green" },
  "schedule": { "launchMonth": 6, "delayMonths": 0, "waitedForWindow": false, "extraDelayDays": 4 },
  "targetOrbit": { "type": "SSO", "altitudeKm": 550, "inclinationDeg": 97.6 },
  "achievedOrbit": null,                     // { type, altitudeKm, inclinationDeg, note } si la nave sobrevive
  "result": "falla",                         // "exito" | "exito_parcial" | "falla" | null (aún no lanzado)
  "lifetimeYears": { "design": 5, "beforeLaunch": 5, "afterLaunch": 0 },
  "events": [
    { "id": "weather", "phase": "countdown", "label": "Retraso por clima", "consequence": "4 días de espera…", "costMUSD": 0.6, "delayDays": 4, "severity": "minor" },
    { "id": "failure", "phase": "liftoff", "label": "Falla del lanzador", "consequence": "Falla durante \"Despegue\": la nave se pierde.", "severity": "fatal" }
  ],                                         // id: weather | minorAnomaly | orbitOffset | partialFailure | failure
  "eventsEnabled": true, "seed": 53,
  "requests": [],                            // pedidos para otros roles (vacío aquí porque el margen es verde). Ejemplo con Electron:
                                             // { "toRole": "spacecraft", "type": "mass-cap", "amountKg": 20, "text": "Margen de masa 10 %: la nave no puede crecer más de 20 kg." }
                                             // type: propellant-offload | mass-cap | orbit-change | extra-delta-v | schedule-delay
  "teamReview": { "acks": { "spacecraft": true, "mission": true }, "notes": "", "requiredRoles": ["spacecraft", "mission"] } // null si no hay modo equipo
}
```

## 8. Dependencias nuevas

**Ninguna.** El módulo es HTML, CSS y JavaScript nativo (módulos ES), igual que los minijuegos existentes en `public/games/`. No usa Phaser porque no lo necesita; es una interfaz de decisiones, no un mapa. Las pruebas usan `node:test`, que viene incluido en Node. `package.json` no se tocó.

## 9. Cómo probarlo

1. `npm install` (si hace falta) y `npm run dev`.
2. Abrir **`http://localhost:3000/games/launch/index.html`**. En `npm run dev`, la ruta de carpeta `/games/launch/` cae al `index.html` del mapa: le pasa igual a `/games/rover/` y viene de antes (ver §11). En el build y en Netlify, `/games/launch/` funciona.
3. Recorrido sugerido:
   - **Marte en difícil:** `…/index.html?scenario=mars&difficulty=dificil`. Falcon 9 no llega por masa, Falcon Heavy no alcanza el presupuesto por esperar la ventana y Ariane 6 sí sirve.
   - **CubeSat:** `?scenario=cubesat`. Electron es demasiado caro y el viaje compartido entra.
   - **Telescopio ecuatorial:** `?scenario=equatorial&difficulty=dificil`. Muestra la penalización por girar el plano desde Florida o Nueva Zelanda; Pegasus queda justo desde Kwajalein.
   - **GEO en difícil:** compara la vida útil lanzando desde Kourou (Ariane 6) y desde Florida (Falcon Heavy).
   - **Smallsat con Alpha en normal**, con modo equipo y semilla `53`: retraso por clima seguido de una falla en el despegue, y después prueba "Comprar otro lanzamiento".
4. Pruebas automáticas: `node --test public/games/launch/tests/` (18 pruebas, todas pasan).
5. Build: `npm run build` incluye `dist/games/launch/` completo (verificado).
6. Para simular otro módulo, en la consola del navegador: `localStorage.setItem('spaceMission.state.v1', JSON.stringify({ spacecraft: { name: 'X', massKg: 950, diameterM: 1.8, heightM: 2.2 }, budget: { totalMUSD: 300, committedMUSD: 180 } }))` y recargar. Los datos aparecen con la etiqueta COMPARTIDO.

Verificación realizada: recorrido completo en Chrome sin interfaz (escritorio de 1400 px y móvil de 390 px) en los escenarios Marte/difícil, smallsat/normal con modo equipo y falla, y estado compartido en fácil. **No hubo errores de consola.**

## 10. Mocks y supuestos temporales

- `data/mock-missions.json`: las 7 misiones simuladas reemplazan a los módulos de **objetivo, nave/instrumentos, órbita, presupuesto y calendario**. Se usan dato por dato: si existe `spacecraft` en el estado compartido, se usa ese y el resto sigue en mock.
- `reservedPropellantKg` es un campo que hoy solo existe en los mocks. Si el módulo de nave no lo publica, se asume 0 (todo el combustible es de operación).
- El modelo "vida útil proporcional al combustible de operación" es una simplificación.
- La disponibilidad de lanzadores, el riesgo de clima, los costos por retraso y los eventos son valores de juego.
- **Roles:** como el juego todavía no tiene un sistema de roles ni multijugador, el modo equipo es **de pantalla compartida**: los jugadores discuten frente a la misma pantalla y marcan su visto bueno. Si existe `team.players`, se muestran los nombres.
- La fecha objetivo y la próxima ventana se expresan en "meses desde hoy" (no hay calendario de juego global).

## 11. Cambios sugeridos fuera de `public/games/launch/` (no implementados)

1. **Equipo de mapa/hub (`index.html` raíz o `vite.config.js`):** en `npm run dev`, los enlaces `/games/launch/` y `/games/rover/` muestran el mapa en lugar del minijuego, porque Vite resuelve las rutas de carpeta al `index.html` raíz. Opciones: enlazar a `/games/launch/index.html`, o agregar un pequeño middleware en `vite.config.js` que sirva `index.html` en las carpetas de `public/games/`.
2. **Todos los módulos:** adoptar `localStorage["spaceMission.state.v1"]` con una sección por módulo, o reemplazarlo por el sistema común que se decida. Si se reemplaza, solo hay que cambiar `readShared` y `writeLaunch` en `js/state.js`.
3. **Módulo de nave/instrumentos:** publicar `spacecraft` con el formato de §7 (al menos `massKg`, `diameterM` y `heightM`; idealmente `propellantKg`, `reservedPropellantKg`, `ispS`, `designLifetimeYears` e `instruments`) y leer `launch.requests` (por ejemplo, `mass-cap` y `propellant-offload`).
4. **Módulo de órbita/objetivo:** publicar `orbit.target` y leer `launch.achievedOrbit` y `launch.result`. Si el resultado es `exito_parcial`, la órbita o la vida útil cambiaron.
5. **Módulo de presupuesto/misión:** publicar `budget` (con `committedMUSD` sin incluir el lanzador) y `schedule`, y descontar `launch.cost.totalMUSD`.
6. **Sistema de roles/multijugador (si se crea):** el rol "Launch / Mission Planning" corresponde a este módulo. Si cada rol juega en su propio dispositivo, los vistos buenos (`teamReview.acks`) deberían venir del sistema común.
7. **Netlify (`netlify.toml`):** no hace falta ningún cambio; los archivos estáticos se sirven antes de la regla `/* → /index.html`.

## 12. Pendientes, limitaciones e ideas

- **Limitaciones:**
  - La capacidad no varía con la altitud dentro de una misma clase de órbita (500 y 1.200 km en LEO cuestan lo mismo).
  - No hay seguro de lanzamiento ni lanzamientos dobles (dos satélites en un cohete).
  - La animación es ilustrativa: la telemetría usa valores típicos, no los de cada cohete.
  - La carpeta `tests/` también se copia al build (es pequeña e inofensiva, pero se podría excluir).
  - La interfaz solo está en español.
  - No se guarda el progreso de la interfaz al recargar; solo se guarda la salida `launch`.
- **Ideas:**
  - Seguro de lanzamiento: pagar un porcentaje para recuperar el dinero si hay falla.
  - Variantes desechable y reutilizable de Falcon 9/Heavy.
  - Precio de viaje compartido por ventana y fechas del calendario de Transporter.
  - Un mapa con la trayectoria de ascenso desde el sitio (inspirado en NASA Mission Viz).
  - Un modo "concurso": puntuación de la decisión según costo, riesgo y margen.
  - Exportar la tabla de compromisos para la presentación del equipo.
  - Validar algunas cifras de Δv o de la penalización GTO con GMAT.
  - Restaurar la sesión de la interfaz desde `launch` al recargar.

## 13. Commits (rama `feature/launch`)

| Commit | Mensaje |
|---|---|
| `947a543` | Add launch module data: launchers, sites, orbits, rules and mocks |
| `ad35b1b` | Add launch rules engine with unit tests |
| `8b2db7d` | Add launch module UI: launcher selection, compatibility check and launch sequence |
| `0b2e19b` | Add README for the launch module folder |
| (siguiente) | Add LAUNCH_CHANGES.md report for the launch module |
