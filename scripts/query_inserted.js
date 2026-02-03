import pool from '../src/config/database.js';

(async ()=>{
  try{
    const [projects] = await pool.query("SELECT id, client_id, developer_id, title, message FROM projects WHERE title = 'DB Test Build Request'");
    console.log('Projects:', projects);
    const [contracts] = await pool.query("SELECT id, developer_id, project_id FROM contracts WHERE project_id IN (SELECT id FROM projects WHERE title = 'DB Test Build Request')");
    console.log('Contracts:', contracts);
    process.exit(0);
  }catch(e){
    console.error(e);
    process.exit(1);
  }
})();