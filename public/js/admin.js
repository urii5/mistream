/**
 * MiStream - Admin Script
 * Panel de control para el administrador
 */

// Verificar autenticación
const token = localStorage.getItem('mistream_token');
if (!token) {
    window.location.href = '/login.html';
}

// Verificar token válido
fetch('/api/verify', {
    headers: { 'Authorization': `Bearer ${token}` }
})
    .then(res => {
        if (!res.ok) throw new Error('Token inválido');
    })
    .catch(() => {
        localStorage.removeItem('mistream_token');
        window.location.href = '/login.html';
    });

// Conexión Socket.IO
const socket = io();

// Referencias DOM
const localPreview = document.getElementById('localPreview');
const previewOverlay = document.getElementById('previewOverlay');
const streamStatus = document.getElementById('streamStatus');
const viewerCountEl = document.getElementById('viewerCount');
const btnCamera = document.getElementById('btnCamera');
const btnScreen = document.getElementById('btnScreen');
const btnVideo = document.getElementById('btnVideo');
const btnStartStream = document.getElementById('btnStartStream');
const btnStopStream = document.getElementById('btnStopStream');
const toggleMic = document.getElementById('toggleMic');
const videoFileInput = document.getElementById('videoFileInput');
const logoutBtn = document.getElementById('logoutBtn');
const adminChatMessages = document.getElementById('adminChatMessages');
const adminChatForm = document.getElementById('adminChatForm');
const adminChatMessage = document.getElementById('adminChatMessage');

// Navegación
const navBtns = document.querySelectorAll('.nav-btn');
const streamPanel = document.getElementById('streamPanel');
const chatPanel = document.getElementById('chatPanel');

// Estado
let peer = null;
let localStream = null;
let currentStreamType = null;
let activeCalls = [];

// Inicializar PeerJS
function initPeer() {
    peer = new Peer({
        debug: 2
    });

    peer.on('open', (id) => {
        console.log('Admin PeerJS ID:', id);
    });

    peer.on('error', (err) => {
        console.error('Error PeerJS:', err);
        alert('Error de conexión: ' + err.message);
    });
}

initPeer();

// =====================================================
// Controles de fuente de video
// =====================================================

btnCamera.addEventListener('click', async () => {
    try {
        clearActiveButtons();
        btnCamera.classList.add('active');

        const constraints = {
            video: { width: 1280, height: 720, facingMode: 'user' },
            audio: toggleMic.checked
        };

        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localPreview.srcObject = localStream;
        previewOverlay.classList.add('hidden');
        currentStreamType = 'camera';
        btnStartStream.disabled = false;

        console.log('Cámara activada');
    } catch (err) {
        console.error('Error accediendo a cámara:', err);
        alert('No se pudo acceder a la cámara: ' + err.message);
    }
});

btnScreen.addEventListener('click', async () => {
    try {
        clearActiveButtons();
        btnScreen.classList.add('active');

        const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { width: 1920, height: 1080 },
            audio: true
        });

        // Si el mic está activado, agregar audio del micrófono
        if (toggleMic.checked) {
            try {
                const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const audioTrack = micStream.getAudioTracks()[0];
                screenStream.addTrack(audioTrack);
            } catch (micErr) {
                console.warn('No se pudo agregar micrófono:', micErr);
            }
        }

        localStream = screenStream;
        localPreview.srcObject = localStream;
        previewOverlay.classList.add('hidden');
        currentStreamType = 'screen';
        btnStartStream.disabled = false;

        // Detectar cuando el usuario deja de compartir
        screenStream.getVideoTracks()[0].onended = () => {
            stopStream();
        };

        console.log('Pantalla compartida');
    } catch (err) {
        console.error('Error compartiendo pantalla:', err);
        if (err.name !== 'AbortError') {
            alert('No se pudo compartir pantalla: ' + err.message);
        }
    }
});

btnVideo.addEventListener('click', () => {
    videoFileInput.click();
});

videoFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    clearActiveButtons();
    btnVideo.classList.add('active');

    // Crear video element para el archivo
    const videoEl = document.createElement('video');
    videoEl.src = URL.createObjectURL(file);
    videoEl.loop = true;
    videoEl.muted = true;

    videoEl.onloadedmetadata = async () => {
        await videoEl.play();

        // Capturar stream del video
        const canvas = document.createElement('canvas');
        canvas.width = videoEl.videoWidth;
        canvas.height = videoEl.videoHeight;
        const ctx = canvas.getContext('2d');

        // Dibujar video en canvas
        function drawFrame() {
            ctx.drawImage(videoEl, 0, 0);
            requestAnimationFrame(drawFrame);
        }
        drawFrame();

        // Obtener stream del canvas
        const canvasStream = canvas.captureStream(30);

        // Agregar audio del video si tiene
        try {
            const audioCtx = new AudioContext();
            const source = audioCtx.createMediaElementSource(videoEl);
            const dest = audioCtx.createMediaStreamDestination();
            source.connect(dest);
            source.connect(audioCtx.destination);

            const audioTrack = dest.stream.getAudioTracks()[0];
            if (audioTrack) {
                canvasStream.addTrack(audioTrack);
            }
        } catch (audioErr) {
            console.warn('No se pudo agregar audio del video:', audioErr);
        }

        localStream = canvasStream;
        localPreview.srcObject = canvasStream;
        previewOverlay.classList.add('hidden');
        currentStreamType = 'video';
        btnStartStream.disabled = false;

        console.log('Video MP4 cargado');
    };

    videoFileInput.value = '';
});

// Toggle micrófono
toggleMic.addEventListener('change', () => {
    if (localStream) {
        const audioTracks = localStream.getAudioTracks();
        audioTracks.forEach(track => {
            track.enabled = toggleMic.checked;
        });
    }
});

function clearActiveButtons() {
    [btnCamera, btnScreen, btnVideo].forEach(btn => btn.classList.remove('active'));
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
}

// =====================================================
// Control de transmisión
// =====================================================

btnStartStream.addEventListener('click', () => {
    if (!localStream || !peer) {
        alert('Selecciona una fuente de video primero');
        return;
    }

    // Notificar al servidor que el stream inició
    socket.emit('admin:start-stream', {
        peerId: peer.id,
        type: currentStreamType
    });

    streamStatus.textContent = '🟢 Transmitiendo';
    btnStartStream.style.display = 'none';
    btnStopStream.style.display = 'inline-flex';

    console.log('Stream iniciado');
});

btnStopStream.addEventListener('click', () => {
    stopStream();
});

function stopStream() {
    // Cerrar todas las llamadas activas
    activeCalls.forEach(call => call.close());
    activeCalls = [];

    // Detener stream local
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    // Notificar al servidor
    socket.emit('admin:stop-stream');

    // Reset UI
    localPreview.srcObject = null;
    previewOverlay.classList.remove('hidden');
    streamStatus.textContent = '🔴 Sin transmitir';
    btnStartStream.style.display = 'inline-flex';
    btnStopStream.style.display = 'none';
    btnStartStream.disabled = true;
    clearActiveButtons();
    currentStreamType = null;

    console.log('Stream detenido');
}

// =====================================================
// Socket Events
// =====================================================

socket.on('connect', () => {
    console.log('Admin conectado al servidor');
});

socket.on('viewer:count', (count) => {
    viewerCountEl.textContent = count;

    // Si hay nuevos viewers y estamos transmitiendo, llamarlos
    // Nota: En una implementación más robusta, manejaríamos esto con IDs específicos
});

// Cuando un viewer se conecta, el servidor notifica
socket.on('viewer:new', (viewerPeerId) => {
    if (localStream && peer) {
        console.log('Llamando a viewer:', viewerPeerId);
        const call = peer.call(viewerPeerId, localStream);
        activeCalls.push(call);

        call.on('close', () => {
            activeCalls = activeCalls.filter(c => c !== call);
        });
    }
});

// Chat
socket.on('chat:message', (data) => {
    addAdminChatMessage(data);
});

function addAdminChatMessage(data) {
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
    <button class="delete-btn" onclick="deleteMessage('${data.timestamp}')">🗑️</button>
  `;

    adminChatMessages.appendChild(messageEl);
    adminChatMessages.scrollTop = adminChatMessages.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function deleteMessage(messageId) {
    socket.emit('chat:delete', messageId);
}

// Enviar mensaje como admin
adminChatForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const message = adminChatMessage.value.trim();
    if (message) {
        socket.emit('chat:message', { user: 'Admin', message });
        adminChatMessage.value = '';
    }
});

// =====================================================
// Navegación
// =====================================================

navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        navBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const panel = btn.dataset.panel;
        streamPanel.style.display = panel === 'stream' ? 'block' : 'none';
        chatPanel.style.display = panel === 'chat' ? 'block' : 'none';
    });
});

// Logout
logoutBtn.addEventListener('click', () => {
    if (localStream) {
        stopStream();
    }
    localStorage.removeItem('mistream_token');
    window.location.href = '/login.html';
});

// Exponer deleteMessage globalmente
window.deleteMessage = deleteMessage;
