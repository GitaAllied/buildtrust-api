import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import jwt from 'jsonwebtoken';

dotenv.config({ path: '.env' });

async function gen() {
  const pool = mysql.createPool({ host: 'localhost', user: 'root', password: '', database: 'buildtrust' });
  const conn = await pool.getConnection();
  const [users] = await conn.execute('SELECT id FROM users WHERE email = ?', ['buildtrustafrica704@gmail.com']);
  if (!users.length) { console.error('User not found'); process.exit(1); }
  const userId = users[0].id;
  const token = jwt.sign({ userId, id: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
  console.log(token);
  conn.release();
  pool.end();
}

gen();
