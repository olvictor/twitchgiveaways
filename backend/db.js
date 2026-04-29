const { Pool } = require('pg');

console.log("DATABASE_URL:", !!process.env.DATABASE_URL);

// CONFIGURAÇÃO PARA O RAILWAY (PRODUÇÃO)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const initDB = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS raffles (
      id UUID PRIMARY KEY,
      channel VARCHAR(255) NOT NULL,
      title VARCHAR(255) DEFAULT 'Novo Sorteio',
      item_image VARCHAR(1000) DEFAULT '',
      min_num INT DEFAULT 1,
      max_num INT DEFAULT 50,
      command VARCHAR(50) DEFAULT '!numero',
      entries JSONB DEFAULT '{}',
      winner JSONB DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // Adiciona as novas colunas para a funcionalidade de Subs
  const updateTableQuery = `
    ALTER TABLE raffles ADD COLUMN IF NOT EXISTS title VARCHAR(255) DEFAULT 'Novo Sorteio';
    ALTER TABLE raffles ADD COLUMN IF NOT EXISTS item_image VARCHAR(1000) DEFAULT '';
    ALTER TABLE raffles ADD COLUMN IF NOT EXISTS target_audience VARCHAR(50) DEFAULT 'all';
    ALTER TABLE raffles ADD COLUMN IF NOT EXISTS sub_multiplier INT DEFAULT 2;
    ALTER TABLE raffles ADD COLUMN IF NOT EXISTS sub_list JSONB DEFAULT '[]';
  `;

  try {
    await pool.query(createTableQuery);
    await pool.query(updateTableQuery);
    console.log('✅ Tabela raffles verificada e atualizada com sucesso (Suporte a Subs)!');
  } catch (err) {
    console.error('❌ Erro ao configurar banco de dados:', err);
  }
};

initDB();

module.exports = pool;