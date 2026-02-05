require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const auth = require('./auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Estado del stream
let streamState = {
  isLive: false,
  adminPeerId: null,
  viewerCount: 0,
  streamType: null // 'camera', 'screen', 'video'
};

// Rutas de autenticación
app.post('/api/login', auth.login);
app.get('/api/verify', auth.verifyToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// Ruta para obtener estado del stream
app.get('/api/stream-status', (req, res) => {
  res.json({
    isLive: streamState.isLive,
    viewerCount: streamState.viewerCount,
    streamType: streamState.streamType
  });
});

// Socket.IO para signaling y chat
io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);

  // Admin inicia stream
  socket.on('admin:start-stream', (data) => {
    streamState.isLive = true;
    streamState.adminPeerId = data.peerId;
    streamState.streamType = data.type;
    socket.join('admin');
    io.emit('stream:started', {
      peerId: data.peerId,
      type: data.type
    });
    console.log('Stream iniciado:', data.type);
  });

  // Admin detiene stream
  socket.on('admin:stop-stream', () => {
    streamState.isLive = false;
    streamState.adminPeerId = null;
    streamState.streamType = null;
    io.emit('stream:stopped');
    console.log('Stream detenido');
  });

  // Viewer se une
  socket.on('viewer:join', () => {
    streamState.viewerCount++;
    socket.join('viewers');
    io.emit('viewer:count', streamState.viewerCount);
    
    // Enviar estado actual al nuevo viewer
    if (streamState.isLive) {
      socket.emit('stream:started', {
        peerId: streamState.adminPeerId,
        type: streamState.streamType
      });
    }
    console.log('Viewer conectado. Total:', streamState.viewerCount);
  });

  // Chat
  socket.on('chat:message', (data) => {
    io.emit('chat:message', {
      user: data.user || 'Anónimo',
      message: data.message,
      timestamp: new Date().toISOString()
    });
  });

  // Admin modera chat (elimina mensaje)
  socket.on('chat:delete', (messageId) => {
    io.emit('chat:deleted', messageId);
  });

  // Desconexión
  socket.on('disconnect', () => {
    if (socket.rooms.has('viewers')) {
      streamState.viewerCount = Math.max(0, streamState.viewerCount - 1);
      io.emit('viewer:count', streamState.viewerCount);
    }
    console.log('Usuario desconectado:', socket.id);
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 MiStream corriendo en http://localhost:${PORT}`);
  console.log(`📺 Panel admin: http://localhost:${PORT}/admin.html`);
  console.log(`👀 Vista viewer: http://localhost:${PORT}/`);
});
