import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import jwt from 'jsonwebtoken';
import http from 'http';

dotenv.config({ path: '.env' });

async function run() {
  const pool = mysql.createPool({ host: 'localhost', user: 'root', password: '', database: 'buildtrust' });
  const conn = await pool.getConnection();
  const [users] = await conn.execute('SELECT id FROM users WHERE email = ?', ['buildtrustafrica704@gmail.com']);
  if (!users.length) { console.error('User not found'); process.exit(1); }
  const userId = users[0].id;
  const token = jwt.sign({ userId, id: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });

  const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/payments/summary',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  };

  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('Status:', res.statusCode);
      try { console.log('Body:', JSON.parse(data)); } catch (e) { console.log('Body (raw):', data); }
      pool.end();
    });
  });

  req.on('error', (e) => {
    console.error('Request error:', e);
    pool.end();
  });

  req.end();
}

run();
