const mysql = require("mysql2/promise");

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
    });
  }
  return pool;
}

async function initDatabase() {
  const connection = await getPool().getConnection();
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS devices (
        sn VARCHAR(64) NOT NULL PRIMARY KEY,
        imei VARCHAR(32) DEFAULT NULL,
        stid VARCHAR(128) DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } finally {
    connection.release();
  }
}

module.exports = { getPool, initDatabase };
