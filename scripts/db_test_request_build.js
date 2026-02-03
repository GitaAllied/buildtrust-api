import pool from '../src/config/database.js';

async function findOrCreateUser(role, name, email) {
  const [rows] = await pool.query('SELECT * FROM users WHERE role = ? LIMIT 1', [role]);
  if (rows && rows.length > 0) return rows[0];
  const password = 'password123';
  const [res] = await pool.query('INSERT INTO users (email, password, name, role, created_at) VALUES (?, ?, ?, ?, NOW())', [email, password, name, role]);
  const [newRow] = await pool.query('SELECT * FROM users WHERE id = ?', [res.insertId]);
  return newRow[0];
}

(async () => {
  try {
    const client = await findOrCreateUser('client', 'Test Client DB', 'test-client-db@example.com');
    const developer = await findOrCreateUser('developer', 'Preist Dev DB', 'preist-dev-db@example.com');

    console.log('Client:', client.id, client.email);
    console.log('Developer:', developer.id, developer.email);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const projectName = 'DB Test Build Request';
      const location = 'DB City';
      const buildingType = 'commercial';
      const budgetRange = '20000-30000';
      const message = 'DB test message';

      const [projectResult] = await connection.query(
        `INSERT INTO projects (
          client_id, developer_id, title, description, location, building_type, budget_range,
          start_date, duration, message, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          client.id,
          developer.id,
          projectName,
          '',
          location,
          buildingType,
          budgetRange,
          null,
          null,
          message,
          'open'
        ]
      );

      const projectId = projectResult.insertId;

      const [contractResult] = await connection.query(
        `INSERT INTO contracts (
          developer_id, project_id, status, created_at, updated_at
        ) VALUES (?, ?, ?, NOW(), NOW())`,
        [developer.id, projectId, 'active']
      );

      const contractId = contractResult.insertId;

      await connection.commit();

      console.log('Inserted projectId=', projectId, 'contractId=', contractId);

      const [projectRows] = await pool.query('SELECT id, client_id, developer_id, title, message FROM projects WHERE id = ?', [projectId]);
      const [contractRows] = await pool.query('SELECT id, developer_id, project_id FROM contracts WHERE id = ?', [contractId]);

      console.log('Project row:', projectRows[0]);
      console.log('Contract row:', contractRows[0]);

      const okProject = projectRows[0] && projectRows[0].client_id === client.id && projectRows[0].developer_id === developer.id;
      const okContract = contractRows[0] && contractRows[0].developer_id === developer.id && contractRows[0].project_id === projectId;

      console.log('Validation: project has correct client & developer?', okProject);
      console.log('Validation: contract links developer & project?', okContract);

    } finally {
      connection.release();
    }

    process.exit(0);
  } catch (err) {
    console.error('DB test failed:', err.stack || err.message || err);
    process.exit(1);
  }
})();