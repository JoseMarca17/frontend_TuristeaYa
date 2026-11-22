# TuristeaYa · Expo

Frontend móvil y web de TuristeaYa. Usa Expo Router y React Native Web, y consume la API FastAPI desplegada en Render.

## Requisitos

- Node.js LTS y npm.
- Expo Go compatible con **Expo SDK 58** para probar en un teléfono.
- Para Android: Android Studio/emulador es opcional.
- Para iOS: Xcode es necesario para el simulador y macOS es necesario para compilar iOS.

## Instalar y ejecutar

```bash
npm ci
npm run go       # Expo Go por LAN
npm run web      # navegador
npm start        # menú de Expo
```

Para usar Expo Go, abre la aplicación Expo Go y escanea el QR que muestra la terminal. El teléfono y el computador deben estar en la misma red Wi-Fi. Si la conexión LAN falla, inicia Expo y selecciona el modo túnel desde el menú.

## API y variables de entorno

La API por defecto es:

```text
https://backend-turisteaya.onrender.com
```

Para cambiarla localmente, crea `.env.local` a partir de `.env.example`:

```bash
cp .env.example .env.local       # macOS/Linux/Git Bash
```

En Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Edita el archivo si hace falta:

```env
EXPO_PUBLIC_API_URL=https://backend-turisteaya.onrender.com
```

Para un backend local desde un teléfono usa la IP LAN del computador, no `localhost`:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.25:8000
```

El frontend no necesita claves de Supabase. Las claves de Supabase pertenecen al backend y no deben colocarse en este proyecto ni en `.env.local`.

## Verificación

```bash
npm run lint
npx tsc --noEmit
node scripts/test-routes.cjs
```

## Estructura

- `src/app/`: pantallas y rutas Expo Router.
- `src/components/`: componentes reutilizables.
- `src/features/`: funcionalidades específicas del turista.
- `src/services/`: API, sesión, catálogo y medios.
- `assets/`: iconos, splash e imágenes de la aplicación.

## Enlaces del backend

- Salud: https://backend-turisteaya.onrender.com/health
- Swagger: https://backend-turisteaya.onrender.com/docs
- Repositorio: https://github.com/JoseMarca17/backend_TuristeaYa

Render puede tardar unos segundos en responder después de un periodo sin uso. Eso es normal en el primer request.
