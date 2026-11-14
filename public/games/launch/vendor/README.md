# vendor/

- `phaser.min.js` — **Phaser 3.90.0** (misma versión que `package.json` del repo: `"phaser": "3.90.0"`), copia sin modificar de `node_modules/phaser/dist/phaser.min.js`.
- `PHASER-LICENSE.md` — licencia MIT de Phaser (© Phaser Studio Inc.).

Se carga con una etiqueta `<script>` clásica en `index.html` (expone `window.Phaser`) porque `public/` no pasa por el bundler de Vite. Así funciona igual en `npm run dev`, en el build y en Netlify, sin CDN ni terceros.

Para actualizar: sube la versión en `package.json`, ejecuta `npm install` y vuelve a copiar `node_modules/phaser/dist/phaser.min.js` aquí.
