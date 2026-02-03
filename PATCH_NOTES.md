// PATCH: Update submitProjectRequest to include developer_id in projects table
// Location: projectsController.js - submitProjectRequest function
// 
// Change line 321-335 from:
/*
      const [projectResult] = await connection.query(
        `INSERT INTO projects (
          client_id, title, description, location, building_type, budget_range,
          start_date, duration, message, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          clientId,
          projectName,
          '', // leave description empty for project requests — message goes to `message` only
          location,
          buildingType,
          budgetRange,
          startDate || null,
          duration || null,
          message,
          'open'
        ]
      );
*/
//
// To:
/*
      const [projectResult] = await connection.query(
        `INSERT INTO projects (
          client_id, developer_id, title, description, location, building_type, budget_range,
          start_date, duration, message, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          clientId,
          developerId,
          projectName,
          '', // leave description empty for project requests — message goes to `message` only
          location,
          buildingType,
          budgetRange,
          startDate || null,
          duration || null,
          message,
          'open'
        ]
      );
*/
