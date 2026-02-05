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
  adminSocketId: null,
  streamType: null // 'camera', 'screen', 'video'
};

// Set para controlar viewers únicos por socket ID
const viewers = new Set();

// Rutas de autenticación
app.post('/api/login', auth.login);
app.get('/api/verify', auth.verifyToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// Ruta para obtener estado del stream
app.get('/api/stream-status', (req, res) => {
  res.json({
    isLive: streamState.isLive,
    viewerCount: viewers.size,
    streamType: streamState.streamType
  });
});

// Socket.IO para signaling y chat
io.on('connection', (socket) => {
  // Admin inicia stream
  socket.on('admin:start-stream', (data) => {
    streamState.isLive = true;
    streamState.adminPeerId = data.peerId;
    streamState.adminSocketId = socket.id;
    streamState.streamType = data.type;

    // Unir admin a su sala
    socket.join('admin');

    // Notificar a todos que empezó el stream
    io.emit('stream:started', {
      peerId: data.peerId,
      type: data.type
    });
    console.log('Stream iniciado:', data.type, 'Admin PeerId:', data.peerId);
  });

  // Admin detiene stream
  socket.on('admin:stop-stream', () => {
    streamState.isLive = false;
    streamState.adminPeerId = null;
    streamState.adminSocketId = null;
    streamState.streamType = null;

    io.emit('stream:stopped');
    console.log('Stream detenido');
  });

  // Viewer se une
  socket.on('viewer:join', () => {
    // Agregar al Set de viewers
    viewers.add(socket.id);

    // Notificar conteo actualizado
    io.emit('viewer:count', viewers.size);

    // Enviar estado actual al nuevo viewer
    if (streamState.isLive) {
      socket.emit('stream:started', {
        peerId: streamState.adminPeerId,
        type: streamState.streamType
      });
    }
    console.log('Viewer conectado. Total:', viewers.size);
  });

  // Viewer listo con su peerId - notificar al admin para que lo llame
  socket.on('viewer:ready', (data) => {
    console.log('Viewer listo con peerId:', data.peerId);
    if (streamState.isLive && streamState.adminSocketId) {
      // Notificar al admin para que llame a este viewer
      io.to(streamState.adminSocketId).emit('viewer:new', data.peerId);
    }
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
    // Si era viewer, sacarlo del Set y actualizar conteo
    if (viewers.has(socket.id)) {
      viewers.delete(socket.id);
      io.emit('viewer:count', viewers.size);
    }

    // Si era admin y estaba transmitiendo
    if (socket.id === streamState.adminSocketId) {
      console.log('Admin desconectado, deteniendo stream');
      streamState.isLive = false;
      streamState.adminPeerId = null;
      streamState.adminSocketId = null;
      streamState.streamType = null;
      io.emit('stream:stopped');
    }

    console.log('Usuario desconectado:', socket.id, 'Total viewers:', viewers.size);
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 MiStream corriendo en http://localhost:${PORT}`);
});
