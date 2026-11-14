# Space Mission — Mapa Explorable

Mapa top-down en Pixel Art del complejo espacial del Nivel 1. Construido con Phaser 3, JavaScript y Vite; todo el arte base se dibuja como texturas pixeladas locales, sin assets remotos obligatorios.

## Ejecutar

```bash
npm install
npm run dev
```

Para la compilación de distribución: `npm run build`. Vite genera el sitio estático en `dist/`, listo para Netlify.

## Controles

- **WASD** o **flechas:** caminar en cuatro direcciones.
- **E:** abrir o cerrar una compuerta cercana; en el control central, abre los controles de la pantalla.
- **ESC:** pausar o reanudar.
- Usa el botón de la esquina superior derecha para pantalla completa. En móviles aparece un pad táctil.

## Pantalla multimedia

Acércate a la gran pantalla del Launch Control Center y pulsa **E**. Desde el panel contextual puedes iniciar/pausar la reproducción o seleccionar un PNG, JPG, WebP, MP4 o WebM. Para precargar un medio desde la configuración, añade el archivo bajo `public/media/` y define `media.src`/`media.type` en `src/config.js`; los videos comienzan solo cuando el usuario pulsa **Iniciar**, según las políticas del navegador. Sin contenido configurado se muestra el monitor espacial Pixel Art integrado.

El juego es únicamente un mapa explorable: no incluye misiones, inventario, gestión funcional de recursos, reparaciones ni despegue.
