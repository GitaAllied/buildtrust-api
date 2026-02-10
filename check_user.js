import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'buildtrust',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelayMs: 0
});

async function checkUser() {
  const conn = await pool.getConnection();
  try {
    const [users] = await conn.execute(
      'SELECT id, email, name, last_login, profile_image FROM users WHERE email = ?',
      ['buildtrustafrica704@gmail.com']
    );
    console.log('User found:', JSON.stringify(users, null, 2));
    
    // Also check projects for this user
    if (users.length > 0) {
      const userId = users[0].id;
      const [projects] = await conn.execute(
        'SELECT id, title, budget, status, created_at FROM projects WHERE client_id = ? LIMIT 5',
        [userId]
      );
      console.log('\nProjects for user:', JSON.stringify(projects, null, 2));
    }
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    conn.release();
    pool.end();
  }
}

checkUser();
