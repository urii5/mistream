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

// Volume controls
const unmuteOverlay = document.getElementById('unmuteOverlay');
const unmuteBtn = document.getElementById('unmuteBtn');
const volumeBtn = document.getElementById('volumeBtn');
const volumeIcon = document.getElementById('volumeIcon');
const volumeSlider = document.getElementById('volumeSlider');

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

                    // Mostrar overlay de unmute si es necesario
                    showUnmuteOverlayIfNeeded();
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

// Variable para controlar reintentos
let retryInterval = null;

// Socket Events
socket.on('connect', () => {
    console.log('Conectado al servidor Socket.IO');
    socket.emit('viewer:join');

    // Destruir peer anterior para obtener un ID fresco
    if (peer) {
        peer.destroy();
        peer = null;
        myPeerId = null;
        currentCall = null;
    }
    initPeer();
});

socket.on('stream:started', (data) => {
    console.log('Stream en vivo detectado:', data);
    streamIsLive = true;
    liveBadge.classList.add('active');

    // Iniciar loop de reintentos hasta recibir llamada
    startRetryLoop();
});

socket.on('stream:stopped', () => {
    console.log('Stream finalizado por admin');
    streamIsLive = false;
    handleStreamEnd();
});

function startRetryLoop() {
    if (retryInterval) clearInterval(retryInterval);

    let retryCount = 0;
    const MAX_RETRIES = 30; // Máximo 30 intentos (60 segundos)

    // Primer intento inmediato
    notifyReady();

    // Reintentar cada 2 segundos si no llega la llamada
    retryInterval = setInterval(() => {
        retryCount++;

        if (currentCall && currentCall.open) {
            console.log('Conexión establecida, deteniendo reintentos');
            clearInterval(retryInterval);
            retryInterval = null;
        } else if (retryCount >= MAX_RETRIES) {
            console.log('Máximo de reintentos alcanzado');
            clearInterval(retryInterval);
            retryInterval = null;
        } else if (myPeerId) {
            console.log('Reintentando handshake... intento', retryCount);
            notifyReady();
        } else {
            console.log('Esperando PeerJS ID...');
        }
    }, 2000);
}

// Manejar fin de stream o cierre
function handleStreamEnd() {
    if (retryInterval) {
        clearInterval(retryInterval);
        retryInterval = null;
    }

    remoteVideo.srcObject = null;
    offlineScreen.classList.remove('hidden');
    liveBadge.classList.remove('active');
    currentCall = null;
}


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

// Recibir historial de chat al conectar/reconectar
socket.on('chat:history', (messages) => {
    // Limpiar mensajes existentes, mantener el welcome
    const welcome = chatMessages.querySelector('.chat-welcome');
    chatMessages.innerHTML = '';
    if (welcome) chatMessages.appendChild(welcome);

    messages.forEach(msg => addChatMessage(msg));
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

// =====================================================
// Volume Controls
// =====================================================

let isMuted = true; // Empieza muteado por política de autoplay

// Función para actualizar el icono de volumen
function updateVolumeIcon() {
    if (remoteVideo.muted || remoteVideo.volume === 0) {
        volumeIcon.textContent = '🔇';
    } else if (remoteVideo.volume < 0.5) {
        volumeIcon.textContent = '🔉';
    } else {
        volumeIcon.textContent = '🔊';
    }
}

// Click en overlay para activar audio
unmuteBtn.addEventListener('click', () => {
    remoteVideo.muted = false;
    isMuted = false;
    unmuteOverlay.classList.add('hidden');
    updateVolumeIcon();

    // Guardar preferencia
    localStorage.setItem('mistream_audio_enabled', 'true');
});

// También ocultar overlay al hacer clic en cualquier parte del video
document.getElementById('videoContainer').addEventListener('click', (e) => {
    if (e.target === unmuteBtn || unmuteBtn.contains(e.target)) return;

    if (!unmuteOverlay.classList.contains('hidden')) {
        remoteVideo.muted = false;
        isMuted = false;
        unmuteOverlay.classList.add('hidden');
        updateVolumeIcon();
    }
});

// Control de volumen con slider
volumeSlider.addEventListener('input', () => {
    const volume = volumeSlider.value / 100;
    remoteVideo.volume = volume;

    if (volume === 0) {
        remoteVideo.muted = true;
        isMuted = true;
    } else if (isMuted) {
        remoteVideo.muted = false;
        isMuted = false;
        unmuteOverlay.classList.add('hidden');
    }

    updateVolumeIcon();

    // Guardar volumen
    localStorage.setItem('mistream_volume', volumeSlider.value);
});

// Botón de mute/unmute
volumeBtn.addEventListener('click', () => {
    if (remoteVideo.muted) {
        remoteVideo.muted = false;
        isMuted = false;
        unmuteOverlay.classList.add('hidden');

        // Si el volumen era 0, ponerlo al 50%
        if (remoteVideo.volume === 0) {
            remoteVideo.volume = 0.5;
            volumeSlider.value = 50;
        }
    } else {
        remoteVideo.muted = true;
        isMuted = true;
    }

    updateVolumeIcon();
});

// Cargar volumen guardado
const savedVolume = localStorage.getItem('mistream_volume');
if (savedVolume !== null) {
    volumeSlider.value = savedVolume;
    remoteVideo.volume = savedVolume / 100;
}

// Mostrar overlay de unmute cuando llega el stream
function showUnmuteOverlayIfNeeded() {
    const audioEnabled = localStorage.getItem('mistream_audio_enabled');

    if (audioEnabled === 'true') {
        // El usuario ya había activado audio antes, intentar desmutear
        remoteVideo.muted = false;
        isMuted = false;
        unmuteOverlay.classList.add('hidden');
    } else {
        // Mostrar overlay para que el usuario active el audio
        unmuteOverlay.classList.remove('hidden');
    }

    updateVolumeIcon();
}

