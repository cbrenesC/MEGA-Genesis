# Space Mission · MEGA Genesis

Juego web en pixel art con un centro de control explorable hecho en Phaser 3. Ocho consolas explican el diseño de misiones espaciales y enlazan a recursos de la NASA. Las dos consolas amarillas abren las simulaciones de lanzamiento y rover lunar con la configuración preparada en las estaciones del mapa.

## Ejecutar localmente

```sh
npm ci
npm run dev
```

Ejecuta `npm run build` para generar el sitio estático en `dist/`, listo para Netlify. Puedes revisarlo con `npm run preview`.

## Cómo jugar

- **WASD o flechas** para caminar. En móviles, usa el pad táctil.
- **E** cerca de un personaje para hablar o cerca de una consola para abrirla. En móviles, usá **Usar**. Seleccioná **Start mission** en una consola de misión.
- **Esc** para cerrar un diálogo o pausar y reanudar el recorrido.
- La introducción del comandante se puede saltar y no aparece si desactivas **Animaciones y video**.

La campaña **Misión científica con rover lunar** es la opción inicial. Confirma el objetivo, configura movilidad, ciencia, energía y comunicaciones, y revisa la carga antes de lanzar. El rover debe respetar sus límites de **145 kg** y **85 millones de dólares**. Su masa y costo se suman a los del módulo de aterrizaje en la revisión de vuelo.

- La consola amarilla de lanzamiento usa la configuración aprobada. Un vuelo que no alcanza la transferencia lunar, consume la reserva del aterrizaje o excede el presupuesto no desbloquea la operación.
- Tras una entrega exitosa, la consola amarilla del rover inicia el aterrizaje simplificado con el diseño que realmente voló. El informe identifica las muestras y fotos confirmadas por Tierra y explica cómo influyeron el lanzador, el instrumento y la antena.
- Los otros escenarios, incluido el viaje lunar tripulado de ida y vuelta, siguen disponibles como prácticas independientes. Volver de un simulador conserva las elecciones. El almacenamiento persistente es opcional.

El botón ⛶ abre el centro de control en pantalla completa. En ventanas anchas se encuadra toda la sala. En pantallas compactas, la cámara sigue al astronauta para conservar la legibilidad.

## Pantalla de anuncios

Acercate al escritorio central debajo de la pantalla y presioná **E** o **Usar**. Podés publicar un texto de hasta 180 caracteres, mostrar una imagen (PNG, JPG, WebP) o cargar y reproducir un video (MP4, WebM) sin sonido. **Restaurar vista orbital** recupera la ilustración Tierra–Luna. Los anuncios y archivos elegidos se muestran solo en el dispositivo durante la visita. Para configurar un archivo inicial para todos los jugadores, configurá `GAME.media.src` en `src/config.js` o asigná una clave bilingüe a `GAME.media.announcementKey` para mostrar un anuncio de texto inicial.

El astronauta y los cuatro tripulantes del centro de control (Durman, Josué, Luis Eduardo y Johana) usan los sprites cenitales de `demogame`. Cada tripulante recorre una ruta corta y se detiene al acercarte. La señal sobre el personaje o la consola más próxima indica que podés interactuar con **E**, **Usar** o tocando la señal. Cada tripulante ofrece tres consejos sobre su área y un recurso de la NASA. La opción **Animaciones y video** desactiva los recorridos, destellos y el movimiento de las señales, sin bloquear la interacción.

## Idiomas

El juego incluye inglés (predeterminado) y español. Podés cambiar el idioma durante la bienvenida, en Configuración o en cualquiera de las dos misiones. Los enlaces conservan el idioma mediante `?lang=en` o `?lang=es`, incluso si decidís jugar sin guardar. Con tu permiso, el navegador también recuerda la selección para próximas visitas.

Los textos de interfaz, del canvas y los subtítulos viven en `src/i18n/en.json` y `src/i18n/es.json`. Cada texto nuevo debe tener la misma clave en ambos catálogos. Usá `data-i18n` para texto estático, `data-i18n-aria` para etiquetas accesibles y `t()` para mensajes dinámicos. El video del comandante conserva su audio original y usa subtítulos sincronizados en ambos idiomas.
