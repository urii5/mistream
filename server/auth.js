const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Configuración (en producción usar variables de entorno)
const JWT_SECRET = process.env.JWT_SECRET || 'mistream-secret-key-2024';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH ||
    bcrypt.hashSync('aguilar1610', 10); // Contraseña por defecto: admin123

/**
 * Login del administrador
 */
const login = async (req, res) => {
    try {
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ error: 'Contraseña requerida' });
        }

        const isValid = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);

        if (!isValid) {
            return res.status(401).json({ error: 'Contraseña incorrecta' });
        }

        const token = jwt.sign(
            { role: 'admin', timestamp: Date.now() },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            token,
            message: 'Acceso concedido'
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
};

/**
 * Middleware para verificar token JWT
 */
const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
};

/**
 * Generar hash de contraseña (utilidad para configurar nueva contraseña)
 */
const generateHash = (password) => {
    return bcrypt.hashSync(password, 10);
};

module.exports = {
    login,
    verifyToken,
    generateHash
};
