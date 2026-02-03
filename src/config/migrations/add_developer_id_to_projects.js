import pool from '../database.js';

export const addDeveloperIdToProjects = async () => {
  try {
    // Check if developer_id column already exists
    const [columns] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='projects' AND COLUMN_NAME='developer_id'`
    );

    const developerIdExists = columns.length > 0;

    if (!developerIdExists) {
      // Add developer_id column
      await pool.query(
        `ALTER TABLE projects ADD COLUMN developer_id INT AFTER client_id`
      );

      // Add foreign key constraint
      try {
        await pool.query(
          `ALTER TABLE projects ADD CONSTRAINT fk_projects_developer FOREIGN KEY (developer_id) REFERENCES users(id) ON DELETE SET NULL`
        );
      } catch (fkErr) {
        console.log('ℹ️ fk constraint add skipped or exists:', fkErr.message);
      }

      // Add index on developer_id
      try {
        await pool.query(
          `CREATE INDEX idx_developer_id ON projects(developer_id)`
        );
      } catch (idxErr) {
        console.log('ℹ️ index add skipped or exists:', idxErr.message);
      }

      console.log('✓ Successfully added developer_id column to projects table');
    } else {
      console.log('✓ developer_id column already exists in projects table');
    }

    // Step: Ensure description column is nullable (always attempt)
    try {
      console.log('🛠️  Ensuring description column is nullable...');
      await pool.query(
        `ALTER TABLE projects MODIFY COLUMN description TEXT NULL`
      );
      console.log('✅ description column set to NULLABLE');
    } catch (err) {
      console.log('ℹ️  Could not alter description column or already nullable:', err.message);
    }
  } catch (error) {
    console.error('Error adding developer_id column:', error.message);
  }
};
