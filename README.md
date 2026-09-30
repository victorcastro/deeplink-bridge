# Deeplink Bridge

Página estática de redirección para abrir una app móvil desde un link web, incluido el tráfico de in-app browsers (Instagram, Facebook, TikTok, X, LinkedIn, Snapchat), donde los Universal Links / App Links suelen no dispararse. Un solo HTML autocontenido, sin dependencias en runtime, desplegado en GitHub Pages.

Solo soporta Universal Links (iOS) y App Links (Android), es decir URLs `https` verificadas de tu dominio. No soporta esquemas personalizados (`myapp://`).

## Requisitos

- Node 20 o superior (desarrollo y CI; el artefacto final no usa Node).
- Dominio de la app con los archivos de asociación publicados:
  - iOS: `/.well-known/apple-app-site-association` con las rutas de `universalLink`.
  - Android: `/.well-known/assetlinks.json` con el package y el SHA-256 del certificado de firma.
- Si falta alguno, el sistema operativo no abre la app y el link cae a la web.

## Flujo de redirección

`src/app.js` detecta la plataforma por User-Agent (`detectPlatform`), elige una estrategia (`pickStrategy`) y la ejecuta a los 50 ms, para que la pantalla de carga alcance a pintarse.

| Estrategia | Condición | Acción |
|---|---|---|
| `androidBrowser` | Android | Navega a un intent `https` con `package` y `S.browser_fallback_url` = tienda. Timer de `fallbackDelay` ms que muestra la pantalla de descarga |
| `androidInApp` | Android + in-app browser | Mismo intent. Timer de `inAppAndroidDelay` ms que muestra las instrucciones para abrir en el navegador |
| `iosBrowser` | iOS | `location.href = universalLink`. Sin timer |
| `iosInApp` | iOS + in-app browser | Muestra instrucciones para abrir en Safari |
| `desktop` | Otro | `location.replace(universalLink)` |

Intent generado (`buildIntentUrl`):

```
intent://www.example.com/app/promo?utm=ig#Intent;scheme=https;package=com.example.myapp;S.browser_fallback_url=<store-url-encoded>;end
```

Detalles del comportamiento:

- **Cancelación de timers.** Los fallbacks se cancelan en `blur`, `pagehide` y `visibilitychange` (hidden), y no se ejecutan si `document.hidden`. Si el SO cambia a la app, no se muestra nada encima.
- **bfcache.** En `pageshow` con `persisted` (volver atrás desde la app o la web) y fuera de in-app browsers, se muestra la pantalla de descarga.
- **iPadOS.** Safari en modo escritorio se detecta como `Macintosh` con `maxTouchPoints > 1`.
- **iOS sin app instalada.** Safari carga la web del Universal Link y no vuelve a esta página, así que no hay forma de detectar la ausencia de la app desde aquí. La web de destino debe ofrecer la instalación (por ejemplo con un [Smart App Banner](https://developer.apple.com/documentation/webkit/promoting-apps-with-smart-app-banners)).
- **Fragmento en Android.** Se descarta el `#...` del destino, porque el intent usa `#` para sus propios extras. Un `;` en la ruta se escapa como `%3B`.

### Limitaciones conocidas

- iOS puede no abrir un Universal Link cuando la navegación es automática y no un gesto del usuario. No se verificó en dispositivos reales. El plan B es mostrar un botón "Abrir app" en `iosBrowser`.
- La detección de in-app browsers se basa en User-Agent (`IN_APP_PATTERNS` en `src/lib.js`) y puede quedar desactualizada cuando las apps cambian su UA.
- El comportamiento de los in-app browsers varía por versión de la app y del SO. Verifícalo en dispositivos.

## Contrato de la URL

La configuración es fija. Cada link de campaña solo varía el destino con `universal`:

```
https://<host>/<repo>/?universal=<url-encoded>
```

```js
const u = 'https://www.example.com/app/promo/verano?utm_source=instagram&utm_campaign=x';
`https://TU-USUARIO.github.io/deeplink-bridge/?universal=${encodeURIComponent(u)}`
```

Codifica siempre el valor con `encodeURIComponent`: un `&` sin codificar trunca el destino.

`resolveConfig` acepta `universal` solo si cumple todo lo siguiente; si no, se ignora en silencio y se usa `config.universalLink`:

- Esquema `https`.
- Mismo host que `config.universalLink`, comparado en minúsculas e ignorando userinfo, puerto, ruta y query.
- Sin `;` (inyección de extras en el intent), sin espacios, caracteres de control ni `\`.

`?deep=` ya no existe y se ignora.

## Modelo de seguridad

El objetivo es que un link hacia esta página no funcione como open redirect. La regla es que el destino solo puede variar dentro del host configurado.

- `getHost` no usa DOM: extrae el host con una regex. Por eso rechaza antes `\` y espacios, que el navegador interpreta distinto (`https://evil.com\@www.example.com` se resolvería a `evil.com`).
- `build.js` escapa `<` en la config inyectada para que ningún valor cierre el `<script>`.
- Los casos están cubiertos en `test/lib.test.js`: host spoofing, userinfo, sufijos de dominio, `http`, `javascript:`, backslash, `;` e inyección en el intent. Si cambias `resolveConfig` o `buildIntentUrl`, corre los tests.

## Configuración

`config.json`, una vez por app:

```json
{
  "universalLink": "https://www.example.com/app/home",
  "androidPackage": "com.example.myapp",
  "iosStoreUrl": "https://apps.apple.com/app/id000000000",
  "androidStoreUrl": "https://play.google.com/store/apps/details?id=com.example.myapp",
  "fallbackDelay": 2500,
  "inAppAndroidDelay": 3000
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `universalLink` | URL `https`, sin `;` | Destino por defecto, destino en escritorio y referencia de host para `?universal=` |
| `androidPackage` | `com.x.y` | Package de Android, usado en el intent |
| `iosStoreUrl` | URL `https` | Pantalla de descarga en iOS |
| `androidStoreUrl` | URL `https` | Pantalla de descarga y `S.browser_fallback_url` del intent |
| `fallbackDelay` | entero > 0 (ms) | Espera en `androidBrowser` antes de mostrar la tienda |
| `inAppAndroidDelay` | entero > 0 (ms) | Espera en `androidInApp` antes de mostrar instrucciones |

`npm run build` valida la config (`validateConfig`) y falla con un mensaje por cada campo inválido.

## Desarrollo

```bash
npm run dev     # build + servidor en http://localhost:8080, recompila al cambiar src/ o config.json
npm test        # node --test "test/*.test.js"
npm run build   # valida config y genera dist/
```

Opciones de `scripts/build.js`, por ejemplo para varias marcas desde el mismo repo:

```bash
node scripts/build.js --config marca-b.json --out dist-b
```

`npm run dev` sirve `index.html` en `/` y `404.html` en cualquier otra ruta, igual que Pages. Para probar desde un teléfono, abre `http://<ip-local>:8080` en la misma red. Con las DevTools solo se simula el User-Agent, no el comportamiento real del in-app browser.

## Estructura

```
config.json            configuración de la app
src/
  index.html           markup y marcadores de inyección (@styles, @config, @lib, @app)
  styles.css
  lib.js               lógica pura: query, host, validación, UA, estrategia, intent. UMD, sin DOM
  app.js               DOM, timers, navegación, copiar link
scripts/
  build.js             valida la config e inlinea todo en dist/
  dev.js               servidor local con rebuild
  check-version.js     gate de versión de los PR
test/lib.test.js
.github/workflows/
  release.yml          test, build, deploy y tag
  pull-request.yml     validación de PR
```

El build reemplaza los marcadores de `src/index.html` y escribe `dist/index.html`, `dist/404.html` (Pages lo sirve para rutas desconocidas, así que cualquier path abre el bridge) y `dist/.nojekyll`. `lib.js` y `app.js` están en ES5 a propósito, porque algunos in-app browsers son antiguos. `lib.js` se exporta como módulo CommonJS en Node y como `window.DeeplinkLib` en el navegador.

## CI/CD

### `pull-request.yml`

Corre en cada PR hacia `main`: `npm test`, `npm run build` y `scripts/check-version.js`.

El gate de versión aplica si el PR toca `src/`, `scripts/`, `test/`, `config.json`, `package.json` o `release.yml`. En ese caso exige:

- `version` en `package.json` con formato `X.Y.Z` y mayor que la de la rama base.
- Que el tag `vX.Y.Z` no exista.

Los PR que solo tocan otros archivos (por ejemplo documentación) no necesitan subir la versión. Para correrlo en local:

```bash
node scripts/check-version.js origin/main
```

La lista de rutas está duplicada en `RELEASE_PATHS` (`scripts/check-version.js`) y en `paths` de `release.yml`; mantenlas sincronizadas.

### `release.yml`

Se ejecuta en push a `main` (con el mismo filtro de rutas) o manualmente. Jobs:

1. `build`: `npm test`, `npm run build` y sube `dist/` como artefacto de Pages.
2. `deploy`: publica en GitHub Pages (`environment: github-pages`).
3. `tag`: si el deploy salió bien, crea `vX.Y.Z` con la versión de `package.json` sobre el commit desplegado (`gh api`, permiso `contents: write` solo en este job). Si el tag ya existe emite un warning y no falla.

### Configuración del repo

- *Settings → Pages → Source: GitHub Actions*.
- *Settings → Branches*: proteger `main` y marcar el check `validate` como requerido, para que el gate bloquee el merge.

## Contribuir

Antes de abrir un PR, corre `npm test` y `npm run build`, y sube la versión en `package.json` si el cambio se despliega. Para agregar un in-app browser nuevo, añade su patrón a `IN_APP_PATTERNS` en `src/lib.js` y un test con su User-Agent en `test/lib.test.js`.
