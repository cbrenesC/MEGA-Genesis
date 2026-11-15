> **Nota de integración:** este informe conserva el historial de la rama de lanzamiento. En `main`, la ruta vigente es `games/launch/`, Vite usa el Phaser de `package.json` y la práctica conserva la versión bilingüe que ya tenía el sitio. Para comandos y rutas actuales, ver [el README del módulo](games/launch/README.md).

# LAUNCH_CHANGES — Módulo de Lanzamiento (Space Mission · NASA Space Apps)

> Este archivo tiene dos partes: **Versión 2 — Phaser e interactivo** (esta sección) y, más abajo, el informe completo de la **Versión 1** sin cambios.

# Versión 2 — Phaser e interactivo

## V2.1 Resumen

- El módulo LAUNCH ahora es un **juego de Phaser 3** con escenas separadas (arranque, misión, hangar, plataforma, vuelo, mapa y resultado). Las pantallas de decisión y los controles son HTML encima del canvas, para que los botones sean grandes en celular.
- El lanzamiento dejó de ser una animación: es un **vuelo que pilotea el jugador**, en vista lateral 2D, con control de empuje, giro, separación de etapas y de cofia, telemetría clara, vista de mapa de la órbita y aceleración del tiempo (1×, 2×, 5× y «⏩ Saltar»).
- La **física es propia y coherente** (gravedad que baja con la altura, empuje, masa que disminuye, aire con Max-Q, giro de la Tierra) y está **calibrada contra el catálogo**: con el 90 % de la capacidad de un cohete el piloto automático llega a la órbita y con el 115 % es imposible. El vuelo bien hecho dura entre 2,7 y 3,9 minutos de juego.
- Los **imprevistos** (clima, falsa alarma, ráfaga de viento, motor que pierde fuerza, falla grave) siguen la confiabilidad del cohete, pero ahora pasan **durante el vuelo**, siempre con una explicación. El pilotaje cuenta: el resultado depende de la órbita lograda, el combustible, el Max-Q y las separaciones.
- Hay **puntaje de pilotaje (0–100)** explicado en pantalla, **ayudas por dificultad** (piloto automático y mensajes en fácil, pistas visuales en normal, nada en difícil) y un **tutorial** de 4 pasos la primera vez.
- Todos los textos se reescribieron para **estudiantes de secundaria** (frases cortas, comparaciones cotidianas, términos técnicos con nombre sencillo, «Ver más» con el dato y la fuente, 4 datos curiosos reales).
- El contrato de salida sube a **`schemaVersion: 2`** y agrega el objeto `flight`; los campos de la versión 1 se mantienen.
- **48 pruebas** pasan (18 de la versión 1 sin cambios + 30 nuevas). No se agregaron dependencias nuevas.

## V2.2 Rama y estado respecto a `main`

- Rama: **`feature/launch`** (la misma de la versión 1). No se hizo merge a `main` ni push.
- `main` había avanzado (pantalla de bienvenida, fuentes, cargador). Se hizo **`git merge main`** en `feature/launch` (commit `5b70a39`), **sin conflictos** y sin tocar nada de `public/games/launch/`. Después del merge, `git diff --name-only main...HEAD` solo lista archivos de `public/games/launch/` y este informe.
- Todo el trabajo nuevo está **solo dentro de `public/games/launch/`**; la única excepción es este archivo, en la raíz.

## V2.3 Archivos

Cambios respecto a la versión 1 (`744e2dc`). Todo está en `public/games/launch/`.

| Archivo | Estado | Descripción |
|---|---|---|
| `vendor/phaser.min.js`, `vendor/PHASER-LICENSE.md`, `vendor/README.md` | Creados | Copia local de Phaser 3.90.0, su licencia MIT y una nota de cómo actualizarla. |
| `index.html` | Modificado | Ahora es el marco del juego: canvas de Phaser, barra superior con pasos y recursos, panel de decisiones, HUD de vuelo, ventana del glosario. Carga Phaser con `<script>` clásico. |
| `styles.css` | Modificado | Estilos del marco del juego, HUD, controles táctiles y adaptación a 390 px. Respeta `prefers-reduced-motion`. |
| `js/main.js` | Modificado (reescrito) | Crea el `Phaser.Game` (Canvas), registra las escenas y maneja la navegación y la barra superior. |
| `js/store.js` | Creado | Estado compartido del juego (lo que antes vivía dentro de `main.js`). |
| `js/screens.js` | Creado | HTML de las pantallas de decisión (misión, catálogo, revisión, resultado) y del panel de recursos, con textos nuevos. |
| `js/ui.js` | Creado | Glosario con «?» y «Ver más», datos curiosos rotativos y avisos. |
| `js/hud.js` | Creado | Panel de vuelo: telemetría, empuje, giro, separar etapa, mapa, tiempo, teclado y táctil. |
| `js/flight.js` | Creado | **Física del vuelo** (pura, sin Phaser): gravedad, empuje, aire, Max-Q, etapas, órbita, piloto automático, puntaje y calibración. |
| `js/outcome.js` | Creado | Une el vuelo con las reglas: planifica los imprevistos y traduce el vuelo a resultado, órbita, vida útil y datos de vuelo. |
| `js/flow.js` | Creado | Prepara el cohete y el piloto automático de referencia; cierra el vuelo y escribe la salida. |
| `js/plain.js` | Creado | Comparaciones cotidianas (peso, velocidad, costo, probabilidades). |
| `js/scenes/` (`BootScene`, `panels` con Briefing/Hangar/Result, `PadScene`, `FlightScene`, `MapScene`, `BackdropScene`, `rocketArt`, `gfx`) | Creados | Escenas de Phaser y arte vectorial original. |
| `js/rules.js` | Modificado | **Solo textos** (detalles, «¿por qué?», sugerencias, pedidos, eventos) y formatos; las fórmulas y reglas no cambiaron. Se agregó el campo `more` («Ver más») a las verificaciones. |
| `js/state.js` | Modificado | `SCHEMA_VERSION = 2`, carga de los datos nuevos y campo `flight` en la salida. |
| `js/sequence.js` | **Eliminado** | La animación de la versión 1 la reemplaza el vuelo interactivo. |
| `data/flight.json` | Creado | Diseños de cohete (etapas, Isp, estructura, TWR) y datos de calibración. |
| `data/flight-calibration.json` | Creado (generado) | Tamaño calibrado de cada cohete para cada destino. Lo genera `tests/calibrate.mjs`. |
| `data/facts.json` | Creado | 4 datos curiosos reales con su fuente. |
| `data/glossary.json`, `data/orbits.json`, `data/launchers.json`, `data/rules.json` | Modificados | **Solo textos** reescritos para secundaria (más el campo `short` en las órbitas y `more` en el glosario). Las cifras no cambiaron. |
| `tests/flight.test.mjs`, `tests/outcome.test.mjs`, `tests/calibrate.mjs` | Creados | 19 + 11 pruebas nuevas y el script de calibración. |
| `README.md` | Modificado | Guía rápida actualizada. |
| `practica-ascenso.html` | Sin cambios | El minijuego anterior se conserva. |
| `data/mock-missions.json`, `data/reference-missions.json`, `data/sites.json`, `tests/rules.test.mjs` | Sin cambios | Las 18 pruebas de la versión 1 siguen pasando sin tocarlas. |

## V2.4 Cómo se integró Phaser

- **Versión: 3.90.0**, la misma que ya usa el repo (`package.json` → `"phaser": "3.90.0"`).
- **Forma de carga:** copia local sin modificar de `node_modules/phaser/dist/phaser.min.js` en `public/games/launch/vendor/`, cargada con una etiqueta `<script src="./vendor/phaser.min.js">` (clásica, expone `window.Phaser`) antes de los módulos del juego.
- **Licencia:** MIT (© Phaser Studio Inc.), copiada en `vendor/PHASER-LICENSE.md`. En `vendor/README.md` están la versión y cómo actualizarla.
- **Por qué así:** `public/` no pasa por el bundler de Vite, así que no se puede hacer `import 'phaser'`. Una copia local funciona igual en `npm run dev`, en el build y en Netlify, **sin CDN ni terceros**, y no cambia `package.json`. Se verificó con un build en una copia limpia: `dist/games/launch/vendor/phaser.min.js` queda incluido (el módulo pesa 2,5 MB en total).
- **Renderizador: Canvas (`Phaser.CANVAS`) a propósito.** El arte es vectorial simple y el modo Canvas funciona igual en cualquier celular o computadora. Con WebGL, el navegador integrado de la herramienta de pruebas fallaba (`Framebuffer status: Incomplete Attachment`). El Canvas de Phaser no admite degradados, así que los cielos se dibujan con franjas (`js/scenes/gfx.js`).
- **Física: propia, sin Arcade ni Matter.** El vuelo necesita gravedad que cambia con la altura, órbitas keplerianas, aire exponencial y pasos de tiempo hasta 120× cuando se salta; con integración RK4 propia (y pura, para poder probarla con Node) es más preciso y más fácil de calibrar que los motores de física de Phaser, que están pensados para choques entre sprites.

## V2.5 Escenas de Phaser

| Escena | Qué hace |
|---|---|
| `BootScene` | Carga los datos (JSON) y muestra datos curiosos mientras tanto. |
| `BriefingScene` | **Misión:** datos de la nave, destino, dinero y fecha; elegir misión de práctica, dificultad y modo equipo. |
| `HangarScene` | **Hangar:** catálogo de cohetes con semáforo y tabla de comparación; y la **revisión** de compatibilidad (margen de peso, cofia, verificaciones con «¿por qué importa?», sugerencias, equipo). |
| `PadScene` | **Plataforma:** dibuja el cohete a su proporción, muestra los imprevistos de la plataforma, la cuenta regresiva (con «cuenta en espera» si hay clima o falsa alarma) y datos curiosos. |
| `FlightScene` | **Vuelo interactivo:** cielo que oscurece, Tierra que se curva, nubes, cohete con llama, etapas y cofia que se separan y caen, explosión, sacudidas (reducidas con `prefers-reduced-motion`), marcas de dirección y de ángulo sugerido, telemetría y HUD. |
| `MapScene` | **Mapa:** vista desde arriba con la órbita proyectada, la órbita pedida, el punto más alto y el más bajo, el punto donde caerías y la ventana de transferencia; dice si la órbita «cierra». |
| `ResultScene` | **Resultado:** qué pasó y por qué, órbita lograda, vida de la nave, puntaje de pilotaje con explicación, datos del vuelo, misiones reales parecidas y entrega al siguiente módulo. |

El panel de recursos (dinero, peso, tiempo, vida y riesgo) está **siempre visible**: como columna en computadora (≥ 1180 px) y como barra de «pastillas» en la parte de arriba en todas las pantallas, incluido el vuelo.

## V2.6 Controles

| Acción | Teclado | Táctil |
|---|---|---|
| Empuje (0–100 %) | `Shift` / `Ctrl`, o `↑` / `↓`; `Z` = máximo, `X` = apagar | Deslizador vertical grande + botones MÁX y APAGAR |
| Girar | `A` / `D` o `←` / `→` | Botones ◀ ▶ grandes (se mantienen pulsados) |
| Separar etapa | `Espacio` | Botón «✂ Separar etapa» |
| Soltar la cofia | `F` | Botón «📦 Soltar cofia» |
| Mirar hacia adelante (para circularizar) | `R` | Botón «🧭 Mirar adelante» |
| Mapa de la órbita | `M` | Botón «🌍 Mapa» |
| Tiempo | `1` `2` `3` = 1×, 2×, 5×; `J` = saltar | Botones 1× 2× 5× y «⏩ Saltar» (hasta el punto más alto o hasta la ventana de transferencia) |
| Piloto automático (fácil) | `P` | Botón «🤖 Piloto automático» |
| Pausa | `Esc` | Botón ⏸ |

Pasos del tutorial (4, solo la primera vez): empuje, inclinar de a poquito, separar etapas y cofia, mapa y tiempo.

## V2.7 Física del vuelo

**Escala y unidades.** Se simula **física real** (Tierra de 6.371 km, g = 9,81 m/s², μ = 3,986·10¹⁴ m³/s²), no una Tierra de juguete. Solo se **acelera el reloj 3,5×** (`PHYS.COMPRESSION`): un ascenso real de ~9 minutos dura unos 2,6 minutos de juego. Así las cifras que ve el jugador (7,8 km/s, 150 km, 400 km) son las reales. Las partes largas (la espera hasta el punto más alto) se acortan con la aceleración del tiempo.

**Modelo (2D, plano de la órbita):**
- Gravedad: `g = μ / r²` (baja con la altura).
- Empuje: `F = ṁ · Isp(h) · g₀`, con `Isp(h) = Isp_vacío + (Isp_nivel_del_mar − Isp_vacío) · p/p₀`, y el empuje sale del acelerador (0–100 %). La masa baja al quemar y se resta la estructura de cada etapa soltada.
- Aire: `ρ = 1,225 · e^(−h / 7.500 m)` hasta 100 km. Resistencia `½ρv²·Cd·A·(1 + 6 sen²α)`: crece si el cohete va «de costado» (α = ángulo de ataque). Presión dinámica `q = ½ρv²` (**Max-Q**): aviso amarillo a 30 kPa, castigo desde 40 kPa y el cohete se rompe a 64 kPa; también se rompe si `q · sen α > 24 kPa` (inclinar demasiado pronto).
- Giro de la Tierra: velocidad inicial `465 · cos φ · sen A` (φ = latitud, A = acimut del lanzamiento).
- Integración: Runge–Kutta de 4.º orden, pasos de 0,1 s en el aire y con motor, hasta 2 s en el vacío sin empuje.
- Órbita: elementos keplerianos a partir de posición y velocidad (punto más alto, punto más bajo, periodo).
- **Llegar a la órbita:** el punto más bajo queda **sobre 150 km**. Para GTO, la Luna y escape (Marte) el jugador llega a una **órbita de espera** y pulsa «Encender transferencia» dentro de una **ventana** que se ve en el mapa (franja naranja y cuenta atrás). Éxito si el apoapsis llega a ≥ 30.000 km (GTO), ≥ 370.000 km (Luna) o se escapa de la Tierra, y la ventana se respeta (error ≤ 70° en GTO y ≤ 35° en Luna y Marte).

**Calibración contra el catálogo** (`tests/calibrate.mjs`, ver también `data/flight.json`):
1. Cada cohete tiene un **diseño** inspirado en el real (número de etapas, Isp, fracción de estructura, empuje/peso al encender), pero **no** un tamaño: el tamaño sale de la calibración.
2. Para cada par cohete–destino con capacidad en `data/launchers.json`, un **piloto automático** busca, por **bisección en escala logarítmica**, la masa de etapas más chica con la que llega a la órbita llevando exactamente la capacidad del catálogo (`capacityKg`). Empuje y cofia se escalan con ese tamaño. Cada destino se calibra con su geometría de referencia (por ejemplo, la órbita polar sale desde Vandenberg a 97,6°, casi sin ayuda del giro de la Tierra).
3. El piloto automático prueba 10 programas de inclinación (altura a la que se «acuesta», qué tan pronto, cuánto subir) y se queda con el que funciona; ese programa queda guardado.
4. **Resultado:** con 90 % de la capacidad se llega a la órbita y con 110–115 % **no** (tampoco con ninguno de los programas probados con 125 %); lo comprueban las pruebas en los **29 pares calibrados** (excepto el viaje compartido, que vuela en un Falcon 9). Las proporciones entre cohetes se mantienen: Electron ≈ 12 t de etapas, Alpha 50 t, Falcon 9 411 t, Ariane 6 441 t, Falcon Heavy 1.854 t, SLS 1.543 t. Los pesos al despegar quedan en el orden de los reales (Falcon 9: 424 t en el juego, ~550 t real; Electron: 12 t, igual que el real) porque el piloto automático no es perfecto.
5. **Pares sin vuelo calibrado:** `PSLV-XL → GTO`. Ese cohete pequeño no llega por el diseño simplificado; para ese par el resultado se calcula con las reglas del catálogo (`resolveAutomatic`) y la pantalla lo avisa. Electron y PSLV usan una etapa extra de transferencia (`transferStages` en `data/flight.json`) en los destinos lejanos.
6. **Cómo se sentirá un margen chico:** a capacidad exacta solo se logra que el punto más bajo pase los 150 km y casi no sobra combustible para redondear la órbita; con 10 % de margen sobra lo justo; con 30 % o más es cómodo. Eso hace coherente el semáforo del hangar con el vuelo.

Cosas que se simplificaron a propósito: etapas en serie (los propulsores de Ariane 6, Falcon Heavy y SLS se tratan como una primera etapa), Pegasus sale de la plataforma (no del avión), vuelo en 2D, giro de la Tierra solo en el plano.

## V2.8 Puntaje de pilotaje (0–100)

Se calcula en `pilotScore()` (`js/flight.js`) y se explica en la pantalla de resultado:

| Parte | Puntos | Cómo se calcula |
|---|---|---|
| Qué tan cerca quedó la órbita | 50 | `50 · (1 − error / 250 km)` (mínimo 20 %), con `error` = promedio de `|punto más bajo − altura pedida|` y `|punto más alto − altura pedida|`. En transferencias: 100 % si llegó y estuvo en la ventana, 55 % si llegó fuera de la ventana, hasta 45 % si solo llegó a la órbita de espera. 0 si no hay órbita. |
| Combustible que sobró | 25 | `25 · min(1, sobrante / (0,5 · sobrante del piloto automático))`: con la mitad de lo que deja el piloto automático ya es el puntaje completo. |
| Cuidar el Max-Q | 15 | 15 si `q_máx ≤ 40 kPa`; baja de forma gradual hasta 0 a 60 kPa. |
| Separar bien | 10 | `10 · (1 − 6 · combustible tirado / combustible total − 0,4 si se soltó la cofia con aire denso − hasta 0,3 por pasar tiempo con mucho ángulo de ataque)`. |

El resultado del juego también depende del vuelo: una órbita corrida cuesta combustible de la nave para corregirla (`hohmannDv`) y baja su vida útil; si la pérdida es ≥ 20 % es **éxito parcial**.

## V2.9 Cambios en el motor de reglas, los datos y el contrato

**Motor de reglas (`js/rules.js`):** no cambiaron las fórmulas, los umbrales ni las probabilidades; las 18 pruebas de la versión 1 pasan sin modificarlas. Cambiaron los **textos** (ver V2.10) y se agregó `more` a cada verificación. `simulateLaunch` se conserva y se usa solo para el par sin vuelo calibrado. `fmtKg`, `fmtMUSD` y `fmtPct` ahora viven en `js/plain.js` y se reexportan.

**Datos:** las cifras no cambiaron. Se reescribieron textos de `glossary.json` (18 términos, ahora con `more` y a veces `formula`), `orbits.json`, `launchers.json` (resúmenes) y `rules.json` (eventos). Nuevos: `flight.json`, `flight-calibration.json` y `facts.json`.

**Contrato de salida:** `schemaVersion` sube de 1 a **2**. Todo lo de la versión 1 se mantiene (un módulo que lea la versión 1 sigue funcionando). Cambios:
- Campo nuevo **`flight`**: `{ maxAltitudeKm, apoapsisKm, periapsisKm, fuelLeftPct, stagingTimes[], maxQKPa, durationSeconds, pilotScore, pilotScoreParts[], autopilot }` (`null` hasta que se lanza, y `null` en el par sin vuelo calibrado). `stagingTimes[].tSeconds` está en segundos **de juego** (física ÷ 3,5).
- `achievedOrbit` puede traer además `periapsisKm` y `apoapsisKm` (órbitas de LEO/SSO).
- Nuevos `events[].id`: `structural` (Max-Q o ángulo de ataque), `crash`, `noOrbit`, `missedWindow`, `noTransfer`, `partialTransfer`. Los de la versión 1 (`weather`, `minorAnomaly`, `orbitOffset`, `partialFailure`, `failure`) siguen. Ahora `orbitOffset` es una ráfaga de viento durante el vuelo, y `partialFailure` es un motor que pierde fuerza.

Ejemplo **real** generado por el módulo (Falcon 9, observatorio de océanos, dificultad normal, con un retraso por clima):

```json
{
  "schemaVersion": 2,
  "module": "launch",
  "status": "lanzado",
  "difficulty": "normal",
  "launcher": {
    "id": "falcon9",
    "name": "Falcon 9",
    "provider": "SpaceX (EE. UU.)",
    "fictional": false,
    "reliability": 0.99
  },
  "cost": {
    "launchMUSD": 70,
    "delayMUSD": 0,
    "eventsMUSD": 0.3,
    "totalMUSD": 70.3
  },
  "mass": {
    "spacecraftKg": 2000,
    "launchMassKg": 2000,
    "propellantOffloadKg": 0,
    "capacityKg": 12000,
    "marginKg": 10000,
    "marginPct": 83.3,
    "marginStatus": "green"
  },
  "targetOrbit": {
    "type": "SSO",
    "altitudeKm": 680,
    "inclinationDeg": 98
  },
  "achievedOrbit": {
    "type": "SSO",
    "altitudeKm": 680,
    "periapsisKm": 678,
    "apoapsisKm": 681,
    "inclinationDeg": 98,
    "note": "Llegaste a la órbita que querías: 678 × 681 km."
  },
  "result": "exito",
  "lifetimeYears": {
    "design": 5,
    "beforeLaunch": 5,
    "afterLaunch": 5
  },
  "events": [
    {
      "id": "weather",
      "phase": "countdown",
      "label": "Retraso por mal clima",
      "consequence": "Hubo mal clima en Base Vandenberg: esperaron 2 días y costó 300 mil dólares más.",
      "costMUSD": 0.3,
      "delayDays": 2,
      "severity": "minor"
    }
  ],
  "flight": {
    "maxAltitudeKm": 678,
    "apoapsisKm": 681,
    "periapsisKm": 678,
    "fuelLeftPct": 2,
    "stagingTimes": [
      {
        "stage": 1,
        "tSeconds": 45,
        "altitudeKm": 103,
        "fuelLeftPct": 0
      }
    ],
    "maxQKPa": 27.1,
    "durationSeconds": 385,
    "pilotScore": 100,
    "pilotScoreParts": [
      {
        "id": "orbit",
        "points": 50,
        "max": 50
      },
      {
        "id": "fuel",
        "points": 25,
        "max": 25
      },
      {
        "id": "maxq",
        "points": 15,
        "max": 15
      },
      {
        "id": "staging",
        "points": 10,
        "max": 10
      }
    ],
    "autopilot": false
  }
}
```

## V2.10 Antes y después de los textos (lenguaje para secundaria)

| # | Antes (versión 1) | Después (versión 2) |
|---|---|---|
| 1 | «Δv (energía)… Para llegar a órbita baja hacen falta unos 9,4 km/s» (glosario *Delta-v (Δv)*) | «**Presupuesto de velocidad (delta-v)**: es cuánto tiene que cambiar de velocidad tu nave para llegar a un lugar. Es como el dinero para un viaje: mientras más lejos vas, más velocidad necesitas…» (+ «Ver más» con la fórmula) |
| 2 | «Tu nave (3500 kg) pesa 2000 kg más de lo que el cohete puede llevar a ese destino (1500 kg).» | «**Tu nave es demasiado pesada para este cohete**: pesa 2000 kg más de lo que puede subir. **Prueba un cohete más grande o pídele al equipo de la nave que le quite peso.**» |
| 3 | «Tu nave (180 kg) usa el 29 % de la capacidad (630 kg). Sobran 450 kg (71.4 %).» | «**Tu nave pesa como unas 3 personas adultas (180 kg).** El cohete puede subir 630 kg, así que ocupa menos de la tercera parte y te sobran 450 kg (71.4 %).» |
| 4 | «65 % de éxito: aproximadamente 1 de cada 3 lanzamientos falla. Riesgo alto para una nave única.» | «Con este cohete, **de cada 100 lanzamientos, 65 salen bien**. Falla 1 de cada 3. Es mucho riesgo para una nave que solo tienes una vez.» |
| 5 | «Cuesta 70 MUSD. Disponible: 200 MUSD. Quedaría: 130 MUSD.» | «Este lanzamiento cuesta **70 millones de dólares (lo mismo que unas 300 casas)**. Tienes 200 millones de dólares, así que te quedarían 130 millones de dólares.» |
| 6 | «La nave plegada (3.5 m × 5 m) cabe en la cofia (4.6 m × 11 m).» | «Tu nave doblada (3.5 m de ancho × 5 m de alto) cabe en la **punta que la protege (cofia)**: hay 4.6 m × 11 m.» |
| 7 | «Inserción en una órbita un poco distinta» (evento) | «**Ráfaga de viento: el cohete se desvía.** El viento a gran altura empujó al cohete. Si el piloto no lo corrige, la órbita sale distinta…» |
| 8 | «✖ Falla: misión perdida… la confiabilidad importa tanto…» | «**Misión perdida.** Esta vez no se pudo. Pasa en la vida real, incluso a los mejores equipos: de cada falla se aprende mucho.» |

También: ningún texto principal muestra fórmulas (están en «Ver más» y «Para los curiosos»); cada explicación tiene como máximo 2 o 3 frases; los porcentajes de falla se dicen como frecuencias («1 de cada 13»); los datos inventados o simplificados se marcan como «dato aproximado para el juego» y «dato de práctica»; hay 4 datos curiosos reales con su fuente (por qué se despega hacia el este, cuánto de un cohete es combustible, la velocidad de la Estación Espacial y las naves dobladas como origami). Los estados no dependen solo del color: llevan ícono y texto (✔ ⚠ ▲ ✖).

## V2.11 Cómo probarlo

```bash
npm install          # si hace falta
npm run dev          # http://localhost:3000/games/launch/index.html
node --test public/games/launch/tests/   # 48 pruebas
node public/games/launch/tests/calibrate.mjs   # solo si cambias la física o los diseños
```

- En `npm run dev`, abre **`/games/launch/index.html`** (la ruta de carpeta cae al mapa; es lo mismo que ya pasaba en la versión 1, ver V1 §11). En el build y en Netlify funciona `/games/launch/`.
- Parámetros útiles: `?scenario=cubesat|smallsat|equatorial|oceans|geo|moon|mars&difficulty=facil|normal|dificil`.
- **Escenarios sugeridos:**
  1. **CubeSat (fácil):** `?scenario=cubesat&difficulty=facil` → «Viaje compartido»; activa el piloto automático o sigue las pistas amarillas.
  2. **Satélite de órbita polar (normal):** `?scenario=smallsat&difficulty=normal` → Alpha o Electron; hay retrasos por clima y puede fallar (Alpha falla 1 de cada 3).
  3. **Marte (difícil):** `?scenario=mars&difficulty=dificil` → solo Ariane 6 sirve; sin ayudas; llega a la órbita de espera y enciende dentro de la franja naranja del mapa.
- **Verificación hecha** (navegador integrado de Claude, escritorio 1400 px y celular 390 px emulado; **no** en un celular real): recorrido completo hasta el resultado con CubeSat (fácil: con piloto automático y con un piloto de prueba que sigue las pistas), satélite polar (normal: vuelo manual hasta quedarse sin combustible → resultado «Misión perdida») y Marte (llega a la órbita de espera y al mapa con la ventana; en difícil se comprobó que no hay piloto automático, pistas ni ángulo sugerido). **No se pilotó a mano un vuelo completo de dificultad difícil hasta el final**, ni se vio en el navegador el encendido de transferencia terminar: ese tramo se comprobó con el piloto automático en las pruebas de Node (Ariane 6 a escape con 5° de error de ventana, Falcon 9 a la Luna y a GTO).

## V2.12 Pruebas

**48 en total**: las **18** de la versión 1 (`tests/rules.test.mjs`) sin cambios + **30 nuevas**.
- `tests/flight.test.mjs` (**19**): gravedad y aire; órbita circular (la EEI da una vuelta en ~92 min); órbita sin empuje con energía conservada; empuje, masa y combustible; Max-Q; ruptura por inclinar muy pronto; giro de la Tierra y peso del sitio; separar etapas y cofia; **calibración (90 % llega, 115 % y 125 % no, en 29 pares)**; viaje compartido; cobertura de la calibración; duración 2–4,6 min; proporciones entre cohetes; Δv de transferencias; transferencia con ventana; órbita redonda del piloto automático; puntaje; pistas de dificultad fácil; combustible de referencia.
- `tests/outcome.test.mjs` (**11**): imprevistos reproducibles por semilla y su frecuencia según la confiabilidad; vuelo perfecto; falla grave programada; no llegar a la órbita; el pilotaje cambia el resultado; costos de la plataforma; par sin vuelo; **contrato v2** (campos de la v1 + `flight`); comparaciones cotidianas; **reglas de lenguaje** (sin fórmulas en el texto principal, explicaciones cortas, glosario con «Ver más», 3 a 6 datos curiosos; hay 4).

## V2.13 Cambios sugeridos para otros equipos (no implementados)

1. **Quien lea `launch` del estado compartido:** leer `schemaVersion` y, si es 2, usar `flight` (puntaje, combustible que sobró) y `achievedOrbit.periapsisKm/apoapsisKm`. Los campos de la versión 1 no cambiaron.
2. **Equipo del mapa (`index.html` raíz / `vite.config.js`):** igual que en la versión 1, en `npm run dev` la ruta `/games/launch/` muestra el mapa; enlazar a `/games/launch/index.html` o agregar un middleware en `vite.config.js`.
3. **Netlify / build:** `public/games/launch/tests/` (incluida `calibrate.mjs`) se copia al `dist/`. Pesa poco, pero se puede excluir. Sin otros cambios: `netlify.toml` sigue igual.
4. **Módulo de nave:** publicar `reservedPropellantKg` y `ispS` si quiere que el vuelo calcule bien cuánto combustible gasta la nave en corregir su órbita (hoy lo toma de los mocks).
5. **Sonido:** no hay audio en este módulo; si el juego tiene un sistema de sonido común, se pueden agregar efectos de motor, cuenta regresiva y separación.

## V2.14 Pendientes, limitaciones e ideas

- **No se probó en un celular físico**, solo con emulación de 390 px en el navegador integrado y con toques simulados por eventos. El deslizador y los botones usan eventos de puntero y `touch-action: none`.
- **Circularización del piloto automático (pulida):** además del programa de ascenso, ahora prueba tres puntos de apagado (`apoLead` 12, 0 y 30 km) y se queda con el que deja la órbita más redonda. Con 30 %, 60 % y 90 % de la carga máxima, las órbitas bajas (LEO y SSO) de los 11 cohetes quedan a menos de 40 km de lo pedido y con menos de 40 km de diferencia entre el punto más bajo y el más alto; antes, Ariane 6 en LEO con 90 % quedaba en 176 × 1.433 km. Se probó una guía que mantiene la altura durante quemadas largas y se descartó porque empeoraba otros casos. En destinos de transferencia la órbita de espera queda en 235–255 km de punto más bajo. Lo comprueba una prueba nueva (64 pruebas en total).
- `PSLV-XL → GTO` no tiene vuelo interactivo (ver V2.7 §5).
- Los motores no tienen límite de reencendidos ni de empuje mínimo; los propulsores laterales se tratan como una etapa; el vuelo es 2D.
- Cuando el panel del navegador está oculto, Phaser pausa el juego (comportamiento normal de `requestAnimationFrame`).
- El `prefers-reduced-motion` quita sacudidas, parpadeo de estrellas y animaciones; no se probó con un lector de pantalla.
- **Ideas:** modo cooperativo (uno gira y otro maneja el empuje); recuperación de la primera etapa; viento por sitio; más tutoriales por destino; guardar el mejor puntaje por misión; sonido.

## V2.15 Commits (rama `feature/launch`, desde `744e2dc`)

| Commit | Mensaje |
|---|---|
| `5b70a39` | Merge main into feature/launch (sin cambios en public/games/launch) |
| `137891b` | Add local Phaser 3.90.0 build under launch/vendor (MIT) |
| `dbee417` | Add flight physics module, launcher designs and calibration against the catalog |
| `86075c6` | Add outcome module, plain-language helpers, rewritten texts and schema v2 |
| `ba392f6` | Fix fatal-event test to fly vertically |
| `55a37a6` | Add Phaser scenes, HUD, screens and styles for the interactive launch (v2 UI) |
| `68b6db7` | Adjust pilot-accuracy test to the new geometry |
| `5526689` | Recalibrate vehicles with per-destination geometry; upper-stage TWR tweaks; pad scale fix |
| `2f93ee1` | Autopilot waits for the transfer window; mobile HUD layout; suggested throttle marker; plain-text fixes |
| (siguientes) | Friendlier destination names in checks · Update launch module README and V2 report |

---

# Versión 1 (informe original, sin cambios)

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

## V3 · Despegue continuo, piezas físicas y pixel art (módulo LAUNCH)

- **Física**: la nave apoyada se mueve con el suelo (`grounded`) hasta que el empuje supera el peso; `thrustToWeight()`; al separar, la pieza conserva posición/velocidad, recibe un empujoncito (`PHYS.SEP_SPEED`) y se conserva el momento. Calibración intacta (19/19 pruebas de vuelo siguen pasando).
- **Mundo** (`js/world.js`, `js/particles.js`): fases por altura real, cámara con escala continua (suelo se aleja → planeta curvo y lejano), piezas sueltas balísticas sin giro (orientación fija en el mundo), humo/fuego en coordenadas del suelo que se quedan atrás.
- **Escena**: paso fijo de 1/60 s, encendido en plataforma (≈2,6 s) antes de soltarse, acercamiento breve de cámara al separar, el piloto automático también genera piezas.
- **Pixel art**: el vuelo y la plataforma se dibujan en un lienzo pequeño con píxeles enteros y se amplían sin suavizado (`js/scenes/render.js`, `rocketArt.js`).
- **HUD** compacto por fase (altura, velocidad, combustible, empuje; datos extra en «Más datos»).
- **Pruebas**: `tests/world.test.mjs` (15). Sin Node en el equipo se corrieron con JavaScriptCore.
- **Pendiente de verificación manual**: pantallas pequeñas/táctiles, fase de espacio con el planeta cerca de la órbita, modo reducido de movimiento.

## V3.1 · Física: órbita alcanzable y caída pareja (módulo LAUNCH)

- **Caída**: la resistencia del aire ya no depende de hacia dónde mira la punta (antes era hasta 7× mayor de costado). Sin empuje y con aire, la punta se alinea sola con el viento (estabilidad de flecha).
- **Órbita lista** (`orbitGoalMet`): también vale una órbita redonda (≤ 15 km entre punto más alto y más bajo) sobre la atmósfera aunque quede un poco más abajo de la pedida. Antes se seguía empujando hasta gastar todo y estirar el otro lado.
- **Guiado**: quemada final `hold` (casi horizontal, levanta la punta lo justo para no caer) e inserción directa (`coastDv`) cuando el ascenso quedó empinado. El juego prueba ambas por misión (`flow.js`); la calibración usa la forma clásica y no cambió.
- **Margen de pilotaje** (`data/flight.json → calibration.pilotMargin`): fácil 1,4 · normal 1,25 · difícil 1,12. Las etapas superiores rinden k veces más con el mismo empuje; la primera etapa no cambia.
- **Pruebas**: `tests/world.test.mjs` 18–21. Corridas con JavaScriptCore (sin Node). No probado dentro del juego: la página ahora necesita Vite.

## V3.2 · Cámara tipo Space Flight Simulator: Tierra fuera de vista en el espacio y zoom (módulo LAUNCH)

- **Escala**: la cámara se aleja con la altura sólo hasta 45 km (`CAMERA.freezeAlt`); después la escala queda fija y la Tierra sale de la pantalla. En el espacio, con la vista normal, sólo se ven el cohete y las estrellas.
- **Zoom en el vuelo**: rueda del mouse, pellizco con dos dedos, botones − / + del HUD y teclas − / + (0 = vista normal). Desde "cohete de cerca" hasta "la Tierra entera" (se dibuja como disco completo; el cohete pasa a ser una marca).
- **Zoom en el mapa**: los mismos controles; al acercar, el mapa se centra en el cohete (0,25× a 40×).
- **Pruebas**: `tests/world.test.mjs` 4 y 22. No probado dentro del juego (requiere Vite/Node).

## V3.3 · Cohetes reconocibles, Tierra real y complejo de lanzamiento (módulo LAUNCH)

- **Cada cohete es distinto** (`rocketArt.js → STYLES`): Falcon 9 (inter-etapa negra, patas, aletas de rejilla), Falcon Heavy (tres núcleos), Electron (negro), Alpha (carbono + cofia blanca), Pegasus (ala delta), PSLV (franjas granate y propulsores pequeños), Vega C (cofia ancha), Ariane 6 (propulsores sólidos), SLS (núcleo naranja, propulsores blancos, torre de escape). En Falcon Heavy, Ariane 6 y SLS la «etapa 0» se dibuja como propulsores laterales y al separarse salen dos piezas, una por lado.
- **Tierra real** (`scenes/earth.js`): mapa del mundo aproximado (franjas de 5°) con continentes, desiertos, hielo y nubes. El globo se orienta para que el sitio de lanzamiento real quede bajo la plataforma y gira con el suelo. Con la cámara al máximo, el encuadre centra el planeta (`anchorY`).
- **Sitio de lanzamiento**: losa y foso de llamas, torre de servicio con brazos, cuatro torres pararrayos con cables, torre de agua, tanques, hangar; mar y playa al este; paisaje por sitio (Florida llana con el edificio de ensamblaje, Vandenberg seco con cerros, Kourou selva, Kwajalein arena).
- **Pruebas**: `tests/world.test.mjs` 23 (mapa y orientación). Arte revisado con una página de prueba temporal en el navegador; no probado dentro del juego (requiere Vite/Node).

## V3.4 · Mapa de órbita en pixel art con la Tierra real (módulo LAUNCH)

- `MapScene.js` se dibuja ahora en el mismo lienzo pequeño que el vuelo (`PixelView`): Tierra de `earth.js` (continentes, hielo, nubes) orientada igual que en el vuelo, atmósfera, círculos a trazos, trayectoria, marcas y cohete en píxeles; etiquetas con la letra monoespaciada del HUD.
- Nuevas primitivas en `render.js`: `drawGlobe`, `clipDisc`, `ring` (recortadas a la pantalla, sirven con cualquier zoom).
- Revisado con una página de prueba (Phaser simulado); no probado dentro del juego (requiere Vite/Node).

## V3.5 · Mapa: Luna, Sistema Solar y zonas de influencia (módulo LAUNCH)

- En el mapa se puede alejar hasta ver todo el Sistema Solar (`MAP_ZOOM`, de 40× a 0,000003×; el zoom del mapa avanza al doble de paso). Al alejar mucho, el centro pasa suavemente de la Tierra al Sol.
- Se dibujan: órbita de la Luna y la Luna (donde llega la transferencia del juego), zona de influencia de la Tierra (924.000 km) y de la Luna, órbita de la Tierra, Sol, y los 7 planetas restantes con su órbita y su zona de influencia. Barra de escala (km / millones de km / UA).
- **Sólo es dibujo**: la física del juego sigue usando únicamente la gravedad de la Tierra; la Luna y los planetas no atraen al cohete. Las posiciones de los planetas son aproximadas (año 2000) y fijas.
- Revisado con una página de prueba (Phaser simulado); no probado dentro del juego (requiere Vite/Node).
