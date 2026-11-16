# Módulo lunar (rover) — informe de cambios

La consola amarilla lunar abre `/games/rover/` con el equipo elegido en las cuatro estaciones de preparación del mapa. El simulador usa el Phaser de `package.json` e incluye sus pruebas en `npm test`.

## Origen del prototipo
El módulo descrito en el encargo (briefing + constructor con 145 kg / 850 créditos + Phaser) **no existía en ninguna rama**
del repositorio. `public/games/rover/index.html` era un canvas 2D de ~40 líneas (sin construcción, sin análisis ni transmisión).
Se reconstruyó sobre Phaser conservando lo útil: 4 cráteres (reescalados), 3 objetivos de muestras, WASD/flechas, cruceta táctil,
batería y reinicio. **Si tienes otra copia con el módulo original, estos cambios no se le aplican.**

## Estructura
- `js/rules.js` — reglas deterministas (sin DOM/Phaser/azar): catálogo, límites, energía, muestras, evaluación, guardado.
- `js/art.js` — pixel art por código (rover según configuración, terreno, muestras); lo usan la vista previa y Phaser.
- `js/main.js` — escenas Phaser (fondo, exploración) + pantallas HTML (HUD, pausa, resultados).
- `tests/index.html` — 19 pruebas de reglas (en `npm test` o en desarrollo, `/games/rover/tests/index.html`).

## Errores corregidos / decisiones
| Área | Causa que se evita | Cambio |
|---|---|---|
| Construcción | Totales sumados incrementalmente al pulsar | `selectComponent` reemplaza; `computeBuild` recalcula siempre desde la configuración |
| Botones | Zonas clicables desacopladas del dibujo | Tarjetas HTML reales (`role=radio`), sin paneles invisibles, delegación de eventos registrada una vez |
| Inicio | Botón sin motivo | `aria-disabled` + motivo exacto (falta categoría, exceso de kg/créditos); se revalida al pulsar |
| Muestras | Dibujo independiente del estado | Cada muestra tiene id y estado (`available→collected→analyzed→transmitted`); el sprite se destruye derivándose del estado; transición única protegida |
| Recoger ≠ analizar | — | Progreso científico = muestras únicas analizadas; objetivo = 3 transmitidas |
| Fallos | — | Moverse, falta de energía o lejanía cancelan sin tocar la muestra ni el contador |
| Pausa | Temporizadores reales | Toda la simulación usa `dt` acumulado; en pausa no avanza nada (también al perder foco/pestaña) |
| Energía | — | Acotada 0..capacidad; recarga solar solo detenido; acciones bloqueadas con explicación |
| Guardado | — | Snapshot validado; restaura estados y no dibuja muestras recogidas; nueva misión lo borra |
| Evaluación | — | `evaluate()` determinista; no hay agente de IA en el módulo, por lo que las sugerencias salen de reglas fijas |

## Pruebas
- 19/19 pruebas de reglas (selección, reemplazo, pulsaciones repetidas, límites, recoger/analizar/transmitir, energía, colisiones, tiempo, guardado).
- En navegador: construcción con clics reales, tecla E mantenida (1 sola recolección, sprite 4→3), pausa congela acción y reloj,
  ciclo completo → resultados (628 pts), reintento limpio, 4 vueltas entre pantallas sin duplicar eventos, guardar/recargar/continuar,
  móvil 375×812 y redimensionado en vivo (cámara entre las franjas del HUD), 20/20 zonas clicables del constructor correctas.

## Alcance de la verificación original de la rama
- Las pruebas de navegador descritas arriba corresponden al prototipo estático anterior a la integración con Vite.
- En el prototipo original no se capturó con las 4 imágenes de referencia
  (no estaban disponibles como archivos), el estilo se infirió de la descripción y del módulo `launch`.
- Sin audio ni pruebas en dispositivo táctil real (solo emulación).

## v3 — Luna más rica, más actividades, Centro de datos
- **Terreno** (`art.js`): campo de brillo con luz desde arriba-izquierda, «mares» oscuros, tramado ordenado, cráteres con pared
  iluminada, reborde, rayos de eyecciones, terrazas y pico central; ~150 cráteres decorativos, guijarros con sombra, zona
  chamuscada de aterrizaje, huellas de ruedas, polvo y viñeta. Fondo de briefing/resultados con Tierra, Vía Láctea y horizonte.
- **Nuevas actividades**: `C` fotografiar 4 puntos de interés (módulo, bandera, monolito, borde del cráter Aurora; valor ×
  cámara) y `R` escanear con radar de subsuelo (320 px) para revelar las muestras ocultas S3 y S4. Objetivos secundarios,
  bonificaciones de puntuación y sugerencias en resultados. Guardado v2 compatible con el equipo y el progreso de muestras de los guardados v1.
- **Centro de datos** (HUD): tarjeta «Enlace Tierra» y un paquete por muestra/foto con barra 0–100 % (marcas 25/50/75 %:
  recogida → análisis → envío → recibido). La Tierra confirma cada envío (barra de recepción) y el informe final lista todos.
- Las consolas de **Ciencia** y **Comunicaciones** muestran, en inglés y español, el tiempo y consumo de captura y envío,
  el alcance del escáner y la confirmación de paquetes. El constructor no se vuelve a mostrar en la simulación.
- Incluye pruebas de escáner, fotos, paquetes 0–100 %, acuses, guardado v1/v2 y transferencia de equipo desde las consolas.

El balance de dificultad y el render en dispositivos reales quedan fuera de las pruebas automatizadas.

## V2.1 · Misma moneda que el lanzamiento, datos y escenografía

- **Moneda**: los «créditos» pasan a **millones de dólares (M US$)**, igual que el módulo de lanzamiento. `LIMITS.budgetMUSD = 85` (antes 850 créditos); cada componente cuesta una décima de su valor anterior (p. ej. chasis ligero 18 M US$). El bono de presupuesto da los mismos puntos (1 por millón sin gastar). `fmtCost()` en `rules.js`; textos en español e inglés actualizados. Las cifras son aproximadas para el juego (orden de un rover lunar pequeño).
- **Datos**: las muestras llevan nombres de materiales lunares reales (anortosita de tierras altas, basalto de mar, brecha de impacto, regolito con hielo de agua).
- **Terreno** (`art.js`): dos suelos como en la Luna real (tierras altas gris cálido y mares de basalto azulados, con borde tramado), relieve por pendiente, Sol bajo con sombras largas, crestas arrugadas, una rima sinuosa al este, bloques expulsados alrededor de los cráteres, cordillera en el borde, sombra permanente con destellos de hielo en los cráteres grandes y un parche de suelo anaranjado (vidrio volcánico).
- **Escena** (`main.js`): capa de luz rasante, hielo que titila, baliza del módulo, sombra de un orbitador que cruza, sombra larga y faros del rover, llama y anillo de polvo en el descenso, rodadas dobles orientadas al movimiento y polvo que cae en arco (sin aire).
- **Fondo** (`skyCanvas`) y Tierra (`earthCanvas`): la Tierra usa los continentes reales del módulo de lanzamiento (`earth.js`); dos cordilleras iluminadas de lado, llanura con cráteres en perspectiva, rocas con sombra, módulo con lámina dorada, rover y huellas.
- Las reglas no cambian (27 casos en verde). Arte revisado con una página de prueba; la escena jugable no se ejecutó aquí (requiere Vite/Node).

## V2.2 · Rover redibujado

- `art.js → roverGrid()`: el rover se dibuja ahora al doble de resolución (68×52) con contorno de 1 px y luz desde arriba-izquierda: suspensión de balancín, ruedas con llanta, radios y brillo (las ligeras son de malla, las todoterreno llevan tacos), cuerpo con paneles blancos y lámina dorada, faro, luz trasera e insignia, celdas de batería, panel solar inclinado con celdas y marco, mástil con cámara (la HD es estéreo), antena de varilla o plato orientable, y brazo articulado con espectrómetro, taladro o láser. Cada componente sigue viéndose distinto y lo que falta aparece punteado.
- `roverCanvas(build, px, frame)`: mismo tamaño de lienzo que antes (la consola no cambia); `frame` gira las ruedas. En el juego hay 4 cuadros y las ruedas giran al avanzar; el rover es un poco más grande (escala 0,72).
- Revisado con una página de prueba; no ejecutado dentro del juego (requiere Vite/Node).
