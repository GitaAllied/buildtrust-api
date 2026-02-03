import jwt from 'jsonwebtoken';
import pool from '../config/database.js';

export const createProject = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    const userId = decoded.userId || decoded.id;

    const { title, type, location, budget, description, client_id, developer_id } = req.body;

    // Use client_id from request or fall back to authenticated user ID
    const projectClientId = client_id || userId;

    // Validate required fields
    if (!title || !description) {
      return res.status(400).json({ 
        error: 'Project title and description are required',
        received: { title, description }
      });
    }

    // Insert project into database

    const [insertResult] = await pool.query(
      `INSERT INTO projects (client_id, developer_id, title, type, location, budget, description, status, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [projectClientId, developer_id || null, title, type || '', location || '', budget || '', description, 'active']
    );
    const projectId = insertResult.insertId;

    // Fetch the created project

    const [projects] = await pool.query(
      'SELECT id, client_id, developer_id, title, type, location, budget, description, status, created_at, updated_at FROM projects WHERE id = ?',
      [projectId]
    );
    const project = Array.isArray(projects) && projects[0] ? projects[0] : null;

    res.json({ 
      message: 'Project created successfully', 
      id: projectId,
      project 
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    res.status(500).json({ error: 'An error occurred while creating the project', details: error.message });
  }
};

export const uploadProjectMedia = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    const userId = decoded.userId || decoded.id;
    const { projectId } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Verify project belongs to user
    const [projects] = await pool.query(
      'SELECT client_id FROM projects WHERE id = ?',
      [projectId]
    );

    if (!projects || !projects[0] || projects[0].client_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized: Project does not belong to this user' });
    }

    // Store media reference (assuming multer handles file upload to /uploads)
    const mediaUrl = `/uploads/${req.file.filename}`;
    const [insertResult] = await pool.query(
      `INSERT INTO project_media (project_id, type, url, filename, created_at) 
       VALUES (?, ?, ?, ?, NOW())`,
      [projectId, 'media', mediaUrl, req.file.filename]
    );

    res.json({
      message: 'Media uploaded successfully',
      id: insertResult.insertId,
      url: mediaUrl
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    res.status(500).json({ error: 'An error occurred while uploading media' });
  }
};

export const getProjects = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    const userId = decoded.userId || decoded.id;


    const [projects] = await pool.query(
      'SELECT id, client_id, developer_id, title, type, location, budget, description, status, created_at, updated_at FROM projects WHERE client_id = ?',
      [userId]
    );
    // Enrich projects with developer info, media, and milestone progress
    const enrichedProjects = await Promise.all(
      (Array.isArray(projects) ? projects : []).map(async (project) => {
        // Get developer info via contract (using LEFT JOIN to handle projects without assigned developers)
        const [contracts] = await pool.query(
          `SELECT c.id, c.developer_id, c.milestones, u.name as developer_name 
           FROM contracts c 
           LEFT JOIN users u ON c.developer_id = u.id 
           WHERE c.project_id = ? 
           LIMIT 1`,
          [project.id]
        );

        const contract = contracts?.[0] || {};
        
        // Calculate progress from milestones
        let progress = 0;
        if (contract.milestones) {
          try {
            const milestones = typeof contract.milestones === 'string' 
              ? JSON.parse(contract.milestones) 
              : contract.milestones;
            if (Array.isArray(milestones) && milestones.length > 0) {
              const completedCount = milestones.filter((m) => m.status === 'completed').length;
              progress = Math.round((completedCount / milestones.length) * 100);
            }
          } catch (e) {
            progress = 0;
          }
        }

        // Get project media
        const [media] = await pool.query(
          `SELECT id, url, filename, mime_type, type FROM project_media WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`,
          [project.id]
        );

        return {
          ...project,
          developer_name: contract.developer_name || 'Assigned Developer',
          developer_id: project.developer_id || contract.developer_id,
          contract_id: contract.id,
          progress,
          media: media?.[0] || null,
        };
      })
    );

    res.json({ 
      projects: enrichedProjects
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    res.status(500).json({ error: 'An error occurred while fetching projects' });
  }
};

export const updateProject = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    const userId = decoded.userId || decoded.id;
    const { projectId } = req.params;
    const { title, type, location, budget, description, status, developer_id } = req.body;

    // Verify project belongs to user
    const [projects] = await pool.query(
      'SELECT client_id FROM projects WHERE id = ?',
      [projectId]
    );

    if (!projects || !projects[0] || projects[0].client_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized: Project does not belong to this user' });
    }

    // Update project
    await pool.query(
      `UPDATE projects SET title = ?, type = ?, location = ?, budget = ?, description = ?, status = ?, developer_id = ?, updated_at = NOW() 
       WHERE id = ?`,
      [title || '', type || '', location || '', budget || '', description || '', status || 'active', developer_id || null, projectId]
    );

    const [updatedProjects] = await pool.query(
      'SELECT id, client_id, title, type, location, budget, description, status, created_at, updated_at FROM projects WHERE id = ?',
      [projectId]
    );

    const project = Array.isArray(updatedProjects) && updatedProjects[0] ? updatedProjects[0] : null;

    res.json({ 
      message: 'Project updated successfully', 
      project 
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    res.status(500).json({ error: 'An error occurred while updating the project' });
  }
};

export const deleteProject = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    const userId = decoded.userId || decoded.id;
    const { projectId } = req.params;

    // Verify project belongs to user
    const [projects] = await pool.query(
      'SELECT client_id FROM projects WHERE id = ?',
      [projectId]
    );

    if (!projects || !projects[0] || projects[0].client_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized: Project does not belong to this user' });
    }

    // Delete project
    await pool.query(
      'DELETE FROM projects WHERE id = ?',
      [projectId]
    );

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    res.status(500).json({ error: 'An error occurred while deleting the project' });
  }
};

/**
 * POST /api/projects/request
 * Handle project request from client to developer
 * Creates project, contract, and associated records
 */
export const submitProjectRequest = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  try {
    // Extract authenticated user info
    let clientId = null;
    let userRole = null;

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
        clientId = decoded.userId || decoded.id;
        userRole = decoded.role || 'client';
      } catch (tokenErr) {
        // Token invalid or expired
        console.warn('Invalid token in project request:', tokenErr.message);
      }
    }

    const {
      developerId,
      projectName,
      location,
      buildingType,
      budgetRange,
      startDate,
      duration,
      message,
      sitePlan
    } = req.body;

    // Validate required fields
    if (!developerId || !projectName || !location || !buildingType || !budgetRange || !message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: developerId, projectName, location, buildingType, budgetRange, message'
      });
    }

    if (!clientId) {
      // User not logged in - still allow to create request but mark as anonymous
      return res.status(401).json({
        success: false,
        error: 'Please log in to submit a project request',
        requireLogin: true
      });
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Step 1: Create project record
      // NOTE: We store the client's freeform request only in the `message` column.
      // Do NOT duplicate the client's `message` into the `description` column.

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
      const projectId = projectResult.insertId;

      // Step 2: Create contract record linking client and developer to the project
      const [contractResult] = await connection.query(
        `INSERT INTO contracts (
          developer_id, project_id, agreed_amount, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [developerId, projectId, null, 'active']
      );

      const contractId = contractResult.insertId;

      // Step 3: If sitePlan file provided, create project_media record
      if (sitePlan && sitePlan.url) {
        await connection.query(
          `INSERT INTO project_media (
            project_id, type, url, filename, mime_type, created_at
          ) VALUES (?, ?, ?, ?, ?, NOW())`,
          [projectId, 'site_plan', sitePlan.url, sitePlan.filename || 'site_plan', sitePlan.mimeType || 'application/pdf']
        );
      }

      await connection.commit();

      console.info(`✅ Project request created: projectId=${projectId}, contractId=${contractId}, developerId=${developerId}`);

      res.json({
        success: true,
        message: 'Project request submitted successfully',
        projectId,
        contractId,
        userRole,
        isDeveloper: userRole === 'developer'
      });

    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Error submitting project request:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit project request',
      details: error.message
    });
  }
};
