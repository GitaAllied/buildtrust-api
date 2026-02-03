import pool from '../database.js';

export const addDeveloperIdToProjects = async () => {
  try {
    // Check if developer_id column already exists
    const [columns] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='projects' AND COLUMN_NAME='developer_id'`
    );

    if (columns.length > 0) {
      console.log('✓ developer_id column already exists in projects table');
      return;
    }

    // Add developer_id column
    await pool.query(
      `ALTER TABLE projects ADD COLUMN developer_id INT AFTER client_id`
    );
    
    // Step 4: Ensure description column is nullable
    try {
      console.log('🛠️  Ensuring description column is nullable...');
      await pool.query(
        `ALTER TABLE projects MODIFY COLUMN description TEXT NULL`
      );
      console.log('✅ description column set to NULLABLE');
    } catch (err) {
      console.log('ℹ️  Could not alter description column or already nullable:', err.message);
    }

    // Add foreign key constraint
    await pool.query(
      `ALTER TABLE projects ADD CONSTRAINT fk_projects_developer FOREIGN KEY (developer_id) REFERENCES users(id) ON DELETE SET NULL`
    );

    // Add index on developer_id
    await pool.query(
      `CREATE INDEX idx_developer_id ON projects(developer_id)`
    );

    console.log('✓ Successfully added developer_id column to projects table');
  } catch (error) {
    console.error('Error adding developer_id column:', error.message);
  }
};
