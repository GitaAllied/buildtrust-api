import { addDeveloperIdToProjects } from '../src/config/migrations/add_developer_id_to_projects.js';

(async () => {
  try {
    console.log('Starting migration runner...');
    await addDeveloperIdToProjects();
    console.log('Migration finished successfully');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
})();