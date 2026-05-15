const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const pool = require('./db');
const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

// Define dinamicamente a URL do Frontend (Localhost para testes, Railway para produção)
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Configuração do Socket.io permitindo o frontend conectar (agora usa a URL dinâmica)
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL, 
    methods: ['GET', 'POST'],
  },
});

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Acesso negado. Token não fornecido.' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido ou expirado.' });
    
    req.user = user; 
    next();
  });
};

// ==========================================
// --- AUTENTICAÇÃO TWITCH ---
// ==========================================

app.get('/api/auth/twitch', (req, res) => {
  const twitchAuthUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${process.env.TWITCH_CLIENT_ID}&redirect_uri=${process.env.TWITCH_REDIRECT_URI}&response_type=code&scope=user:read:email`;
  res.redirect(twitchAuthUrl);
});

app.get('/api/auth/twitch/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const tokenResponse = await axios.post('https://id.twitch.tv/oauth2/token', null, {
      params: {
        client_id: process.env.TWITCH_CLIENT_ID,
        client_secret: process.env.TWITCH_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.TWITCH_REDIRECT_URI,
      },
    });

    const accessToken = tokenResponse.data.access_token;

    const userResponse = await axios.get('https://api.twitch.tv/helix/users', {
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    const twitchUser = userResponse.data.data[0];

    const userToken = jwt.sign(
      { id: twitchUser.id, username: twitchUser.login, display_name: twitchUser.display_name, profile_image: twitchUser.profile_image_url, platform: 'TWITCH' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' } 
    );

    // Redireciona de volta para o FRONTEND_URL dinâmico
    res.redirect(`${FRONTEND_URL}/?token=${userToken}`);
    
  } catch (error) {
    console.error('Erro na autenticação com a Twitch:', error);
    res.redirect(`${FRONTEND_URL}/?error=auth_failed`);
  }
});

// ==========================================
// --- AUTENTICAÇÃO KICK ---
// ==========================================

app.get('/api/auth/kick', (req, res) => {

  const params = new URLSearchParams({
    client_id: process.env.KICK_CLIENT_ID,
    redirect_uri: process.env.KICK_REDIRECT_URI,
    response_type: 'code'
  });

  const authUrl =
    `https://id.kick.com/oauth/authorize?${params.toString()}`;

  console.log('URL OAUTH:', authUrl);

  res.redirect(authUrl);
});

/*
|--------------------------------------------------------------------------
| CALLBACK KICK
|--------------------------------------------------------------------------
*/

app.get('/api/auth/kick/callback', async (req, res) => {

  const { code } = req.query;

  const FRONTEND_URL =
    process.env.FRONTEND_URL || 'http://localhost:5173';

  if (!code) {
    return res.redirect(
      `${FRONTEND_URL}/?error=no_code`
    );
  }

  try {

    /*
    |--------------------------------------------------------------------------
    | TROCA CODE POR ACCESS TOKEN
    |--------------------------------------------------------------------------
    */

    const tokenResponse = await axios.post(
      'https://id.kick.com/oauth/token',

      qs.stringify({
        grant_type: 'authorization_code',
        code: code,
        client_id: process.env.KICK_CLIENT_ID,
        client_secret: process.env.KICK_CLIENT_SECRET,
        redirect_uri: process.env.KICK_REDIRECT_URI
      }),

      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    console.log('TOKEN RESPONSE:', tokenResponse.data);

    const accessToken = tokenResponse.data.access_token;

    /*
    |--------------------------------------------------------------------------
    | BUSCA DADOS DO USUARIO
    |--------------------------------------------------------------------------
    */

    const userResponse = await axios.get(
      'https://api.kick.com/public/v1/users',

      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json'
        }
      }
    );

    console.log('USER RESPONSE:', userResponse.data);

    const userData = userResponse.data.data?.[0];

    if (!userData) {
      throw new Error('Usuário não encontrado');
    }

    /*
    |--------------------------------------------------------------------------
    | GERA JWT DO SEU SISTEMA
    |--------------------------------------------------------------------------
    */

    const userToken = jwt.sign(
      {
        id: userData.id,
        username: userData.name,
        display_name: userData.name,
        profile_image: userData.profile_picture,
        platform: 'KICK'
      },

      process.env.JWT_SECRET,

      {
        expiresIn: '7d'
      }
    );

    /*
    |--------------------------------------------------------------------------
    | REDIRECIONA PARA FRONTEND
    |--------------------------------------------------------------------------
    */

    res.redirect(
      `${FRONTEND_URL}/?token=${userToken}`
    );

  } catch (error) {

    console.error(
      'ERRO OAUTH KICK:',
      error.response?.data || error.message
    );

    res.redirect(
      `${FRONTEND_URL}/?error=kick_auth_failed`
    );
  }
});

// ==========================================
// --- ROTAS REST (Express) ---
// ==========================================

app.get('/api/raffles/user/me', authenticateToken, async (req, res) => {
  const username = req.user.username; 
  const platform = req.user.platform; 

  try {
    const result = await pool.query(
      `SELECT id, title, created_at, winner, item_image, platform 
      FROM raffles 
      WHERE channel = $1 AND platform = $2
      ORDER BY created_at DESC`,
      [username, platform]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar sorteios do usuário:', error);
    res.status(500).json({ error: 'Erro ao buscar sorteios' });
  }
});

app.post('/api/raffles', authenticateToken, async (req, res) => {
  const { id } = req.body;
  
  const username = req.user.username; 
  const platform = req.user.platform || 'TWITCH'; 

  try {
    await pool.query(
      'INSERT INTO raffles (id, channel, platform) VALUES ($1, $2, $3)',
      [id, username, platform]
    );
    
    res.status(201).json({ message: 'Sorteio criado com sucesso', id, platform });
  } catch (error) {
    console.error('Erro ao criar sorteio:', error);
    res.status(500).json({ error: 'Erro ao salvar no banco de dados' });
  }
});

app.get('/api/raffles/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM raffles WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sorteio não encontrado' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao buscar sorteio:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ==========================================
// --- COMUNICAÇÃO EM TEMPO REAL (Socket.io) ---
// ==========================================

io.on('connection', (socket) => {
  console.log(`🔌 Novo usuário conectado: ${socket.id}`);

  socket.on('join_raffle', (raffleId) => {
    socket.join(raffleId);
    console.log(`👤 Usuário entrou na sala do sorteio: ${raffleId}`);
  });

  socket.on('admin_update', async (data) => {
    const { id, channel, title, minNum, maxNum, command, entries, winner, itemImage, targetAudience, subMultiplier, subList } = data;

    try {
      await pool.query(
        `UPDATE raffles 
         SET channel = $1, title = $2, min_num = $3, max_num = $4, command = $5, entries = $6, winner = $7, item_image = $8, target_audience = $9, sub_multiplier = $10, sub_list = $11
         WHERE id = $12`,
        [
          channel, 
          title || 'Novo Sorteio', 
          minNum, 
          maxNum, 
          command, 
          JSON.stringify(entries), 
          winner ? JSON.stringify(winner) : null, 
          itemImage || '', 
          targetAudience || 'all',
          subMultiplier || 2,
          JSON.stringify(subList || []),
          id
        ]
      );

      socket.to(id).emit('viewer_update', {
        channel, title, minNum, maxNum, command, entries, winner, itemImage, targetAudience, subMultiplier
      });
    } catch (error) {
      console.error('Erro ao atualizar banco via socket:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ Usuário desconectado: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});