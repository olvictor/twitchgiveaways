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

// Configuração do Socket.io permitindo o frontend conectar
const io = new Server(server, {
  cors: {
    origin: 'https://twitchgiveaways-production.up.railway.app/', // Em produção, coloque a URL do seu frontend (ex: http://lhttps://twitchgiveaways-production.up.railway.app/)
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
// --- AUTENTICAÇÃO TWITCH ---

// 1. O usuário clica em "Logar" e o React chama essa rota, que redireciona para a Twitch
app.get('/api/auth/twitch', (req, res) => {
  const twitchAuthUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${process.env.TWITCH_CLIENT_ID}&redirect_uri=${process.env.TWITCH_REDIRECT_URI}&response_type=code&scope=user:read:email`;
  res.redirect(twitchAuthUrl);
});

// 2. A Twitch devolve o usuário para cá com um "código"
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
      { id: twitchUser.id, username: twitchUser.login, display_name: twitchUser.display_name, profile_image: twitchUser.profile_image_url },
      process.env.JWT_SECRET,
      { expiresIn: '7d' } 
    );

    // O redirecionamento final com a URL do React cravada no código
    res.redirect(`http://https://twitchgiveaways-production.up.railway.app//?token=${userToken}`);
    
  } catch (error) {
    console.error('Erro na autenticação com a Twitch:', error);
    res.redirect(`http://https://twitchgiveaways-production.up.railway.app//?error=auth_failed`);
  }
});

// --- ROTAS REST (Express) ---


app.get('/api/raffles/user/me', authenticateToken, async (req, res) => {
  const twitchUsername = req.user.username; // Pega o nome do token validado

  try {
    // Busca todos os sorteios desse canal, ordenando por data de criação (mais novos primeiro)
    const result = await pool.query(
      `SELECT id, title, created_at, winner, item_image 
      FROM raffles 
      WHERE channel = $1 
      ORDER BY created_at DESC`,
      [twitchUsername]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar sorteios do usuário:', error);
    res.status(500).json({ error: 'Erro ao buscar sorteios' });
  }
});

// 1. Criar um novo sorteio (Chamado pelo botão "CRIAR NOVO SORTEIO" no frontend)
app.post('/api/raffles', authenticateToken, async (req, res) => {
  const { id } = req.body;
  
  // Pegamos o nome da conta logada direto do token
  const twitchUsername = req.user.username; 

  try {
    // Inserimos o id do sorteio e o nome do canal como dono
    await pool.query(
      'INSERT INTO raffles (id, channel) VALUES ($1, $2)',
      [id, twitchUsername]
    );
    
    res.status(201).json({ message: 'Sorteio criado com sucesso', id });
  } catch (error) {
    console.error('Erro ao criar sorteio:', error);
    res.status(500).json({ error: 'Erro ao salvar no banco de dados' });
  }
});

// 2. Buscar dados iniciais do sorteio (Chamado quando alguém abre a tela Admin ou Viewer)
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

// --- COMUNICAÇÃO EM TEMPO REAL (Socket.io) ---

io.on('connection', (socket) => {
  console.log(`🔌 Novo usuário conectado: ${socket.id}`);

  // Usuário (Admin ou Viewer) entra na "sala" exclusiva daquele UUID
  socket.on('join_raffle', (raffleId) => {
    socket.join(raffleId);
    console.log(`👤 Usuário entrou na sala do sorteio: ${raffleId}`);
  });

  // Admin envia uma atualização (novo número, configuração alterada, vencedor sorteado)
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

// --- INICIANDO SERVIDOR ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});