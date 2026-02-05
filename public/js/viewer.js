/**
 * MiStream - Viewer Script
 * Maneja la conexión WebRTC y el chat para espectadores
 */

// Conexión Socket.IO
const socket = io();

// Referencias DOM
const remoteVideo = document.getElementById('remoteVideo');
const offlineScreen = document.getElementById('offlineScreen');
const liveBadge = document.getElementById('liveBadge');
const viewerCountEl = document.getElementById('viewerCount');
const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const chatUsername = document.getElementById('chatUsername');
const chatMessage = document.getElementById('chatMessage');

// Estado
let peer = null;
let currentCall = null;
let myPeerId = null;
let streamIsLive = false;

// Inicializar PeerJS
function initPeer() {
    if (peer) return; // Evitar doble inicialización

    peer = new Peer({
        debug: 2
    });

    peer.on('open', (id) => {
        console.log('PeerJS conectado con ID:', id);
        myPeerId = id;

        // Si el stream ya está en vivo, notificar que estamos listos
        if (streamIsLive) {
            notifyReady();
        }
    });

    peer.on('call', (call) => {
        console.log('Recibiendo llamada del admin...');
        call.answer(); // Responder sin stream (solo recepción)

        call.on('stream', (remoteStream) => {
            console.log('Stream recibido. Tracks:', remoteStream.getTracks());

            // Asignar stream al video
            remoteVideo.srcObject = remoteStream;

            // Intentar reproducir con manejo de errores
            const playPromise = remoteVideo.play();

            if (playPromise !== undefined) {
                playPromise.then(() => {
                    console.log('Reproducción iniciada exitosamente');
                    offlineScreen.classList.add('hidden');
                    liveBadge.classList.add('active');
                }).catch(err => {
                    console.error('Error al reproducir video (Autoplay Policy?):', err);

                    // Si el error es NotAllowedError, intentar mutear y reproducir de nuevo
                    if (err.name === 'NotAllowedError' && !remoteVideo.muted) {
                        console.log('Intentando reproducir en mute...');
                        remoteVideo.muted = true;
                        remoteVideo.play();
                    }
                });
            }
        });

        call.on('close', () => {
            console.log('Llamada cerrada por el remoto');
            handleStreamEnd();
        });

        call.on('error', (err) => {
            console.error('Error en llamada WebRTC:', err);
        });

        currentCall = call;
    });

    peer.on('error', (err) => {
        console.error('Error PeerJS:', err);
        // Si el ID está tomado o error fatal, quizás reintentar
    });

    peer.on('disconnected', () => {
        console.log('PeerJS desconectado del servidor signaling. Reconectando...');
        peer.reconnect();
    });
}

// Notificar al servidor que estamos listos para recibir
function notifyReady() {
    if (myPeerId) {
        console.log('Notificando que estamos listos con peerId:', myPeerId);
        socket.emit('viewer:ready', { peerId: myPeerId });
    }
}

// Manejar fin de stream
function handleStreamEnd() {
    remoteVideo.srcObject = null;
    offlineScreen.classList.remove('hidden');
    liveBadge.classList.remove('active');
    currentCall = null;
    // No ponemos streamIsLive = false aquí inmediatamente por si es un reinicio de llamada (cambio de fuente)
    // Pero si el servidor manda 'stream:stopped', ahí sí.
}

// Socket Events
socket.on('connect', () => {
    console.log('Conectado al servidor Socket.IO');
    socket.emit('viewer:join');
    initPeer();
});

socket.on('stream:started', (data) => {
    console.log('Stream en vivo detectado:', data);
    streamIsLive = true;
    liveBadge.classList.add('active');
    notifyReady();
});

socket.on('stream:stopped', () => {
    console.log('Stream finalizado por admin');
    streamIsLive = false;
    handleStreamEnd();
});

socket.on('viewer:count', (count) => {
    viewerCountEl.textContent = count;
});

// Chat
socket.on('chat:message', (data) => {
    addChatMessage(data);
});

socket.on('chat:deleted', (messageId) => {
    const msgEl = document.querySelector(`[data-id="${messageId}"]`);
    if (msgEl) {
        msgEl.remove();
    }
});

function addChatMessage(data) {
    const messageEl = document.createElement('div');
    messageEl.className = 'chat-message';
    messageEl.dataset.id = data.timestamp;

    const time = new Date(data.timestamp).toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit'
    });

    const isAdmin = data.user.toLowerCase() === 'admin';

    messageEl.innerHTML = `
    <span class="username ${isAdmin ? 'admin' : ''}">${escapeHtml(data.user)}${isAdmin ? ' 👑' : ''}</span>
    <span class="text">${escapeHtml(data.message)}</span>
    <span class="time">${time}</span>
  `;

    chatMessages.appendChild(messageEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Enviar mensaje
chatForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const user = chatUsername.value.trim() || 'Anónimo';
    const message = chatMessage.value.trim();

    if (message) {
        socket.emit('chat:message', { user, message });
        chatMessage.value = '';
    }
});

// Guardar nombre de usuario en localStorage
chatUsername.addEventListener('change', () => {
    localStorage.setItem('mistream_username', chatUsername.value);
});

// Cargar nombre guardado
const savedUsername = localStorage.getItem('mistream_username');
if (savedUsername) {
    chatUsername.value = savedUsername;
}
