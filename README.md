# MiStream 📺

Plataforma de TV en vivo donde un administrador puede transmitir contenido y los visitantes solo pueden ver.

## Características

- ✅ **Streaming en vivo** - Cámara, pantalla o video MP4
- ✅ **Chat en tiempo real** - Interacción con viewers
- ✅ **Panel de admin** - Protegido con contraseña
- ✅ **15 viewers simultáneos** - Usando PeerJS
- ✅ **100% Gratuito** - Sin tarjeta de crédito

## Stack Tecnológico

| Componente | Tecnología |
|------------|------------|
| Backend | Node.js + Express + Socket.IO |
| WebRTC | PeerJS (cloud gratuito) |
| Auth | bcrypt + JWT |
| Hosting | Render.com |

## Instalación Local

```bash
# Clonar repositorio
git clone https://github.com/tu-usuario/mistream.git
cd mistream

# Instalar dependencias
cd server
npm install

# Iniciar servidor
npm start
```

Abre `http://localhost:3000` en tu navegador.

## Credenciales por Defecto

- **URL Admin**: `/login.html`
- **Contraseña**: `admin123`

> ⚠️ Cambia la contraseña antes de deploy a producción.

## Cambiar Contraseña Admin

1. Genera un nuevo hash:
```bash
node -e "console.log(require('bcryptjs').hashSync('TU-NUEVA-CONTRASEÑA', 10))"
```

2. Configura la variable de entorno:
```
ADMIN_PASSWORD_HASH=tu-hash-aqui
```

## Deploy en Render.com

1. Sube el código a GitHub
2. Ve a [render.com](https://render.com) y crea cuenta gratuita
3. **New** → **Web Service**
4. Conecta tu repositorio
5. Configura:
   - **Name**: mistream
   - **Root Directory**: server
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
6. En **Environment** agrega:
   - `ADMIN_PASSWORD_HASH` = (tu hash de contraseña)
7. Click **Create Web Service**

## Uso

### Como Administrador
1. Ve a `/login.html`
2. Ingresa la contraseña
3. Selecciona fuente (cámara/pantalla/video)
4. Click "Iniciar Transmisión"

### Como Viewer
1. Ve a la URL principal `/`
2. Espera a que el admin inicie el stream
3. ¡Disfruta y usa el chat!

## Estructura

```
mistream/
├── server/
│   ├── index.js      # Servidor principal
│   ├── auth.js       # Autenticación
│   └── package.json
├── public/
│   ├── index.html    # Página viewer
│   ├── login.html    # Login admin
│   ├── admin.html    # Panel admin
│   ├── css/styles.css
│   └── js/
│       ├── viewer.js
│       └── admin.js
└── render.yaml       # Config Render.com
```

## Licencia

MIT
