# TuristeaYa — frontend

Aplicación móvil y web construida con **Expo SDK 58**, React Native, Expo Router y React Native Web. El backend FastAPI está en un repositorio separado y ya está desplegado en Render.

## Requisitos

- Node.js LTS (se recomienda Node 20 o superior).
- npm.
- Para móvil: Expo Go compatible con **SDK 58** y Android Studio/emulador o un teléfono Android.
- Para iOS: macOS con Xcode, o un iPhone con Expo Go.

## Instalación

Desde la carpeta raíz del repositorio:

```bash
cd outputs/TuristeaYa-Expo
npm ci
```

## Configuración de la API

El frontend usa por defecto el backend desplegado:

```text
https://backend-turisteaya.onrender.com
```

No se necesita ninguna clave de Supabase para ejecutar el frontend contra Render. Si se necesita cambiar la API, copia la plantilla y edita `.env.local`:

```bash
cp .env.example .env.local       # macOS/Linux/Git Bash
```

En Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Contenido:

```env
EXPO_PUBLIC_API_URL=https://backend-turisteaya.onrender.com
```

Para usar un backend local desde un teléfono, no uses `localhost`: coloca la IP local del computador, por ejemplo:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.25:8000
```

El teléfono y el computador deben estar en la misma red Wi-Fi.

## Ejecutar la aplicación

Desde `outputs/TuristeaYa-Expo`:

```bash
npm run go       # Expo Go por LAN
npm run web      # navegador
npm start        # menú general de Expo
```

También se puede ejecutar el script de PowerShell desde la raíz:

```powershell
./outputs/INICIAR_EXPO_GO.ps1
```

Después de iniciar Expo, escanea el QR con Expo Go o abre la aplicación en un emulador. Si Expo Go indica que la versión no es compatible, instala una versión de Expo Go compatible con SDK 58.

## Comprobaciones útiles

```bash
npm run lint
npx tsc --noEmit
node scripts/test-routes.cjs
```

## Backend

La aplicación apunta a Render y no requiere levantar FastAPI para la demostración normal. Documentación de la API desplegada:

- Salud: https://backend-turisteaya.onrender.com/health
- Swagger: https://backend-turisteaya.onrender.com/docs
- Repositorio: https://github.com/JoseMarca17/backend_TuristeaYa

Para ejecutar el backend localmente, sigue las instrucciones del README del repositorio backend. Necesitarás que el responsable del proyecto te proporcione las credenciales de Supabase; nunca las subas a GitHub.

## Estructura principal

- `outputs/TuristeaYa-Expo/src/app/`: pantallas y rutas Expo Router.
- `outputs/TuristeaYa-Expo/src/components/`: componentes reutilizables.
- `outputs/TuristeaYa-Expo/src/services/`: API, sesión y servicios.
- `outputs/TuristeaYa-Expo/src/features/`: funcionalidades del turista.
- `outputs/CONTEXTO_TURISTEAYA.md`: contexto técnico del proyecto.
