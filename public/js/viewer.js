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

// Inicializar PeerJS
function initPeer() {
    peer = new Peer({
        debug: 2
    });

    peer.on('open', (id) => {
        console.log('PeerJS conectado con ID:', id);
    });

    peer.on('call', (call) => {
        console.log('Recibiendo llamada del admin...');
        call.answer(); // Responder sin stream (solo recepción)

        call.on('stream', (remoteStream) => {
            console.log('Stream recibido');
            remoteVideo.srcObject = remoteStream;
            offlineScreen.classList.add('hidden');
            liveBadge.classList.add('active');
        });

        call.on('close', () => {
            console.log('Llamada cerrada');
            handleStreamEnd();
        });

        currentCall = call;
    });

    peer.on('error', (err) => {
        console.error('Error PeerJS:', err);
    });
}

// Manejar fin de stream
function handleStreamEnd() {
    remoteVideo.srcObject = null;
    offlineScreen.classList.remove('hidden');
    liveBadge.classList.remove('active');
    currentCall = null;
}

// Socket Events
socket.on('connect', () => {
    console.log('Conectado al servidor');
    socket.emit('viewer:join');
    initPeer();
});

socket.on('stream:started', (data) => {
    console.log('Stream iniciado:', data);
    liveBadge.classList.add('active');

    // El admin llamará a los viewers, no necesitamos hacer nada aquí
    // solo mostrar que está en vivo
});

socket.on('stream:stopped', () => {
    console.log('Stream detenido');
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
