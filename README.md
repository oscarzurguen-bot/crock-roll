# Crock&Roll HQ · la app de la charanga

App web instalable (PWA) con los bolos, el calendario, el bote, el inventario, La banda, el repertorio y las estadísticas.
Con la nube activada, cada músico entra desde su móvil, se apunta a los bolos y ve si va; el administrador hace la selección final y marca los pagos.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La app entera (escena, páginas y lógica). |
| `nube.js` | Sincronización con Firebase, entrada del administrador y de los músicos. |
| `firebase-config.js` | Configuración del proyecto de Firebase (solo de referencia: ya va copiada dentro de `index.html`). |
| `sw.js`, `manifest.json`, `icons/` | Lo que hace que se pueda instalar en el móvil y abrir sin conexión. |
| `habitacion.webp`, `espana.json` | Imagen de la habitación y mapa de provincias. |
| `firestore.rules` | Reglas de la base de datos (cópialas en Firebase). |

## 1. Crear la base de datos (Firebase) — una sola vez

1. Entra en <https://console.firebase.google.com> → **Añadir proyecto** → nombre `crocknroll` (Google Analytics no hace falta).
2. **Authentication** → *Comenzar* → pestaña *Método de inicio de sesión* → **Anónimo** → *Habilitar* → Guardar.
3. **Firestore Database** → *Crear base de datos* → ubicación `europe-southwest1 (Madrid)` → modo producción.
   En la pestaña **Reglas**, borra lo que haya, pega el contenido de `firestore.rules` y pulsa *Publicar*.
4. ⚙️ **Configuración del proyecto** → *General* → *Tus apps* → icono **`</>`** (web) → nombre `Crock&Roll` → Registrar.
   Copia los valores de `firebaseConfig` (apiKey, authDomain, projectId…) dentro de **`firebase-config.js`**.

El plan gratuito (Spark) sobra para una charanga.

## 2. Publicarla en GitHub Pages

1. En GitHub crea un repositorio **público** nuevo, por ejemplo `crock-roll`.
2. *Add file* → *Upload files* → arrastra **todo el contenido** de esta carpeta (incluida la carpeta `icons` y el archivo `.nojekyll`) → *Commit changes*.
3. *Settings* → *Pages* → *Build and deployment* → *Deploy from a branch* → rama `main`, carpeta `/ (root)` → Save.
4. En un par de minutos estará en `https://oscarzurguen-bot.github.io/crock-roll/`.
5. En Firebase → **Authentication** → *Configuración* → *Dominios autorizados* → *Añadir dominio* → `oscarzurguen-bot.github.io`.

## 3. Primer arranque (administrador)

1. Abre la app → pestaña **Administrador** → escribe una contraseña. **La primera que pongas queda como contraseña del administrador.**
2. Pasa tus datos actuales desde la página de Claude: allí toca el **logo de la rana** → *Copia de seguridad* → **Copiar**.
3. En la app toca el **logo** → *Importar datos* → pega → **Importar y sustituir** (pulsa dos veces para confirmar).
4. Revisa **La banda**: cada miembro es un usuario que podrá entrar con su nombre.

## 4. Los músicos

- Mándales el enlace. Entran en **Músico**, eligen su nombre y ponen un PIN de 4 cifras: **el primero que pongan queda como su PIN**.
- Si alguien lo olvida: logo → *Accesos* → **Resetear PIN**.
- Pueden ver todo y **apuntarse / desapuntarse** a los bolos abiertos. Crear, editar y borrar es solo del administrador.

**Instalarla en el móvil**
- Android (Chrome): menú ⋮ → **Instalar aplicación** (o *Añadir a pantalla de inicio*).
- iPhone (Safari): botón **Compartir** → **Añadir a pantalla de inicio**.

## 5. Cómo funciona una convocatoria

1. Al crear un bolo, la convocatoria queda **abierta**. Los músicos pulsan **Me apunto** o **No puedo** en la tarjeta.
2. La administrador abre el bolo → *Convocatoria*: marca quién va y pulsa **Cerrar**. El nº de músicos se rellena solo.
3. Cuando el bolo pasa a **Cobrado**, aparece *Pagos a músicos*: se marca a quién se le ha pagado. La tarjeta muestra «Pagados 5/8».

## Actualizar la app

Sube los archivos cambiados al repositorio y **cambia `VERSION` en `sw.js`** (por ejemplo `crocknroll-v2`) para que los móviles cojan la versión nueva.

## Seguridad (léelo)

Funciona igual que Yacente: Firebase solo deja entrar a quien abre la app (acceso anónimo), y la contraseña del administrador y los PIN los comprueba la propia app.
Es suficiente para una charanga, pero **no es una caja fuerte**: alguien con conocimientos técnicos y el enlace podría leer o tocar los datos sin pasar por la pantalla de entrada.
No guardes en la app nada delicado (DNI, cuentas bancarias…). Si algún día hace falta más seguridad, se puede cambiar a cuentas de Google por persona.
