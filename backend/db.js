const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Criação da tabela (se não existir)
const initDB = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS raffles (
      id UUID PRIMARY KEY,
      channel VARCHAR(255) NOT NULL,
      min_num INT DEFAULT 1,
      max_num INT DEFAULT 50,
      command VARCHAR(50) DEFAULT '!numero',
      item_image VARCHAR(1000) DEFAULT '', -- NOVO: Guarda o link da imagem do prêmio
      entries JSONB DEFAULT '{}',
      winner JSONB DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(queryText);
    console.log('✅ Tabela "raffles" verificada/criada com sucesso.');
  } catch (err) {
    console.error('❌ Erro ao criar tabela:', err);
  }
};

initDB();

module.exports = pool;