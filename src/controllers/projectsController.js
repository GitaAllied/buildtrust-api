import jwt from 'jsonwebtoken';
import pool from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createNotification } from './notificationsController.js';

// Helper function to create or update contract for a project
const ensureContractExists = async (projectId, projectData) => {
  try {
    // Get project details if not provided
    let project = projectData;
    if (!project) {
      const [projectRows] = await pool.query(
        'SELECT id, title, building_type, location, budget_min, budget_max, budget, duration FROM projects WHERE id = ?',
        [projectId]
      );
      project = projectRows[0];
    }

    // Check if contract already exists
    const [existingContract] = await pool.query(
      'SELECT id FROM contracts WHERE project_id = ?',
      [projectId]
    );

    if (existingContract.length === 0) {
      // Fetch the master template from database
      const [templateRows] = await pool.query(
        'SELECT contract_terms FROM contracts WHERE is_template = TRUE LIMIT 1'
      );
      const templateTerms = templateRows?.[0]?.contract_terms || '';

      // Create new contract for this project with the template terms
      await pool.query(
        `INSERT INTO contracts (project_id, status, contract_terms, created_at, updated_at) 
         VALUES (?, 'active', ?, NOW(), NOW())`,
        [projectId, templateTerms]
      );
      console.log(`✅ Contract created for project ${projectId} with template`);
    }

    return true;
  } catch (err) {
    console.error('Error ensuring contract exists:', err);
    throw err;
  }
}

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

    // Verify project belongs to user or is assigned to the developer
    const [projects] = await pool.query(
      'SELECT client_id, developer_id FROM projects WHERE id = ?',
      [projectId]
    );

    const project = projects?.[0];
    if (!project || (project.client_id !== userId && project.developer_id !== userId)) {
      return res.status(403).json({ error: 'Unauthorized: Project does not belong to this user' });
    }

    // Store media reference with project-specific subdirectory path
    const mediaUrl = `/uploads/projects/${projectId}/${req.file.filename}`;
    const [insertResult] = await pool.query(
      `INSERT INTO project_media (project_id, type, url, filename, mime_type, created_at) 
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [projectId, 'media', mediaUrl, req.file.filename, req.file.mimetype]
    );

    console.log('✅ Media uploaded successfully:', { projectId, filename: req.file.filename, mediaUrl });

    res.json({
      message: 'Media uploaded successfully',
      id: insertResult.insertId,
      url: mediaUrl
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    console.error('❌ Media upload error:', error);
    res.status(500).json({ error: 'An error occurred while uploading media' });
  }
};

export const getAllProjects = async (req, res) => {
  try {
    const [projects] = await pool.query(
      `SELECT 
        p.id, p.client_id, p.developer_id, p.title, p.type, p.location, 
        p.budget, p.budget_min, p.budget_max, p.description, p.status, p.acceptance_status,
        p.created_at, p.updated_at,
        uc.name as client_name,
        ud.name as developer_name,
        c.id as contract_id,
        c.developer_signed_at,
        c.client_signed_at,
        a.status as application_status
      FROM projects p
      LEFT JOIN users uc ON p.client_id = uc.id
      LEFT JOIN users ud ON p.developer_id = ud.id
      LEFT JOIN contracts c ON p.id = c.project_id
      LEFT JOIN applications a ON p.id = a.project_id AND p.developer_id = a.developer_id`
    );
    console.log('✅ getAllProjects query result:', {
      projectCount: Array.isArray(projects) ? projects.length : 0,
      firstProject: Array.isArray(projects) ? projects[0] : null
    });
    res.json(Array.isArray(projects) ? projects : []);
  } catch (error) {
    console.error('❌ getAllProjects error:', error);
    res.status(500).json({ error: 'An error occurred while fetching projects', details: error.message });
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
      'SELECT id, client_id, developer_id, title, type, location, budget, budget_min, budget_max, description, status, created_at, updated_at FROM projects WHERE client_id = ?',
      [userId]
    );
    // Enrich projects with developer info and media
    const enrichedProjects = await Promise.all(
      (Array.isArray(projects) ? projects : []).map(async (project) => {
        // Get developer name from users table using project.developer_id
        let developer_name = 'Assigned Developer';
        if (project.developer_id) {
          const [developers] = await pool.query(
            'SELECT name FROM users WHERE id = ?',
            [project.developer_id]
          );
          developer_name = developers?.[0]?.name || 'Assigned Developer';
        }

        // Get contract info
        const [contracts] = await pool.query(
          'SELECT id FROM contracts WHERE project_id = ? LIMIT 1',
          [project.id]
        );
        const contract = contracts?.[0] || {};

        // Get project media (all images) - handle both new records (with mime_type) and old records (without)
        const [media] = await pool.query(
          `SELECT id, url, filename, mime_type, type FROM project_media 
           WHERE project_id = ? AND (mime_type LIKE 'image/%' OR mime_type IS NULL OR filename LIKE '%.jpg%' OR filename LIKE '%.png%' OR filename LIKE '%.gif%')
           ORDER BY created_at DESC`,
          [project.id]
        );

        return {
          ...project,
          developer_name,
          contract_id: contract.id,
          progress: 0,
          media: media?.[0] || null, // First image for backward compatibility
          media_array: Array.isArray(media) ? media : [], // All images for rotation
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

export const getProjectById = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    const userId = decoded.userId || decoded.id;
    const userRole = decoded.role;
    const { projectId } = req.params;

    console.log(`📖 getProjectById: projectId=${projectId}, userId=${userId}, role=${userRole}`);

    // Query project with all details
    const [projects] = await pool.query(
      `SELECT id, client_id, developer_id, title, description, message, location, building_type, 
              budget, budget_min, budget_max, start_date, duration, 
              status, acceptance_status, assigned_at, inspection_requested, created_at, updated_at 
       FROM projects WHERE id = ?`,
      [projectId]
    );

    console.log(`✅ Project query result:`, { found: projects?.length > 0, project: projects?.[0] });

    if (!projects || projects.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = projects[0];

    // Verify user has access: client owner, assigned developer, or admin
    const isClient = project.client_id === userId;
    const isDeveloper = project.developer_id === userId;
    const isAdmin = userRole === 'admin' || userRole === 'sub_admin';

    if (!isClient && !isDeveloper && !isAdmin) {
      return res.status(403).json({ error: 'Unauthorized: You do not have access to this project' });
    }

    // Enrich with client info
    const [clients] = await pool.query(
      'SELECT id, name, email, profile_image FROM users WHERE id = ?',
      [project.client_id]
    );
    const client = clients?.[0] || null;

    // Enrich with developer info (if assigned)
    let developer = null;
    if (project.developer_id) {
      const [developers] = await pool.query(
        'SELECT id, name, email, rating, total_reviews, profile_image FROM users WHERE id = ?',
        [project.developer_id]
      );
      developer = developers?.[0] || null;
    }

    // Enrich with contract details if one exists
    const [contracts] = await pool.query(
      `SELECT id, status, developer_signature_url, client_signature_url, developer_signed_at, client_signed_at, contract_terms, needs_resign
       FROM contracts WHERE project_id = ? AND is_template = FALSE LIMIT 1`,
      [projectId]
    );
    const contract = contracts?.[0] || null;

    // Calculate hours remaining if pending
    let hours_remaining = null;
    if (project.acceptance_status === 'pending' && project.assigned_at) {
      const deadline = new Date(project.assigned_at).getTime() + 72 * 60 * 60 * 1000;
      const now = new Date().getTime();
      hours_remaining = Math.max(0, Math.ceil((deadline - now) / (60 * 60 * 1000)));
    }

    // Fetch project media (first image)
    // Include records with mime_type LIKE 'image/%' OR where mime_type is NULL (old records)
    const [media] = await pool.query(
      `SELECT id, url, filename FROM project_media 
       WHERE project_id = ? AND (mime_type LIKE 'image/%' OR mime_type IS NULL OR filename LIKE '%.jpg%' OR filename LIKE '%.png%' OR filename LIKE '%.gif%') 
       ORDER BY created_at DESC LIMIT 1`,
      [projectId]
    );
    const projectImage = media?.[0] || null;

    console.log(`📸 Project ${projectId} media query result:`, { projectImage, mediaCount: media?.length });

    res.json({
      project: {
        ...project,
        client,
        developer,
        hours_remaining,
        media: projectImage,
        contract
      }
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    console.error('❌ getProjectById error:', error.message);
    console.error('   Stack:', error.stack);
    res.status(500).json({ error: 'An error occurred while fetching the project', details: error.message });
  }
};

const saveBase64Signature = async (base64Data, projectId, role) => {
  const matches = base64Data.match(/^data:(image\/png|image\/jpeg);base64,(.+)$/);
  if (!matches) {
    throw new Error('Invalid signature data URL');
  }

  const extension = matches[1] === 'image/png' ? '.png' : '.jpg';
  const buffer = Buffer.from(matches[2], 'base64');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const uploadsDir = path.join(__dirname, '../../uploads');
  const contractDir = path.join(uploadsDir, 'contracts', String(projectId));

  if (!fs.existsSync(contractDir)) {
    fs.mkdirSync(contractDir, { recursive: true });
  }

  const fileName = `${Date.now()}-${role}-signature${extension}`;
  const filePath = path.join(contractDir, fileName);
  await fs.promises.writeFile(filePath, buffer);
  return `/uploads/contracts/${projectId}/${fileName}`;
};

export const signContract = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    const userId = decoded.userId || decoded.id;
    const userRole = decoded.role || decoded.userRole;
    const { projectId } = req.params;

    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    if (!['client', 'developer'].includes(userRole)) {
      return res.status(403).json({ error: 'Only client or developer can sign contracts' });
    }

    const [projectRows] = await pool.query(
      'SELECT client_id, developer_id FROM projects WHERE id = ?',
      [projectId]
    );

    if (!projectRows || projectRows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = projectRows[0];
    if (userRole === 'client' && project.client_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized: You are not the client for this project' });
    }
    if (userRole === 'developer' && project.developer_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized: You are not the developer assigned to this project' });
    }

    const [contractRows] = await pool.query(
      'SELECT id, status, developer_signature_url, client_signature_url FROM contracts WHERE project_id = ? LIMIT 1',
      [projectId]
    );

    if (!contractRows || contractRows.length === 0) {
      return res.status(404).json({ error: 'Contract not found for this project' });
    }

    const contract = contractRows[0];
    let signatureUrl = null;

    if (req.file) {
      signatureUrl = `/uploads/contracts/${projectId}/${req.file.filename}`;
    } else if (req.body.signatureDataUrl) {
      signatureUrl = await saveBase64Signature(req.body.signatureDataUrl, projectId, userRole);
    } else {
      return res.status(400).json({ error: 'Signature image file or data URL is required' });
    }

    const updateFields = [];
    const updateValues = [];
    if (userRole === 'developer') {
      updateFields.push('developer_signature_url = ?', 'developer_signed_at = NOW()');
      updateValues.push(signatureUrl);
    } else {
      updateFields.push('client_signature_url = ?', 'client_signed_at = NOW()');
      updateValues.push(signatureUrl);
    }

    const query = `UPDATE contracts SET ${updateFields.join(', ')} WHERE id = ?`;
    updateValues.push(contract.id);
    await pool.query(query, updateValues);

    // Check if both parties have now signed
    const [updatedContractRows] = await pool.query(
      'SELECT developer_signature_url, developer_signed_at, client_signature_url, client_signed_at FROM contracts WHERE id = ?',
      [contract.id]
    );
    
    const updatedContract = updatedContractRows[0];
    const bothSigned = updatedContract.developer_signature_url && updatedContract.developer_signed_at && 
                       updatedContract.client_signature_url && updatedContract.client_signed_at;

    if (bothSigned) {
      // Both parties have signed, set needs_resign to 0
      await pool.query(
        'UPDATE contracts SET needs_resign = 0 WHERE id = ?',
        [contract.id]
      );
    }

    res.json({
      message: 'Contract signature saved successfully',
      contractId: contract.id,
      signatureUrl,
      userRole,
      status: contract.status,
      bothSigned: bothSigned
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    console.error('❌ signContract error:', error);
    res.status(500).json({ error: 'An error occurred while signing the contract', details: error.message });
  }
};

export const updateProject = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    const userId = decoded.userId || decoded.id;
    const userRole = decoded.role;
    const { projectId } = req.params;
    const { title, type, location, budget, description, status, developer_id } = req.body;

    // Verify authorization: user must be either the project client or an admin
    const [projects] = await pool.query(
      'SELECT client_id FROM projects WHERE id = ?',
      [projectId]
    );

    if (!projects || !projects[0]) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const isClient = projects[0].client_id === userId;
    const isAdmin = userRole === 'admin' || userRole === 'sub_admin';

    if (!isClient && !isAdmin) {
      return res.status(403).json({ error: 'Unauthorized: You do not have permission to update this project' });
    }

    // Update project
    await pool.query(
      `UPDATE projects SET title = ?, type = ?, location = ?, budget = ?, description = ?, status = ?, developer_id = ?, updated_at = NOW() 
       WHERE id = ?`,
      [title || '', type || '', location || '', budget || '', description || '', status || 'active', developer_id || null, projectId]
    );

    const [updatedProjects] = await pool.query(
      'SELECT id, client_id, developer_id, title, type, location, budget, budget_min, budget_max, description, status, created_at, updated_at FROM projects WHERE id = ?',
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
    console.error('Error updating project:', error);
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
      budget_min,
      budget_max,
      startDate,
      duration,
      message,
      sitePlan
    } = req.body;

    // Validate required fields
    if (!projectName || !location || !buildingType || !message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: projectName, location, buildingType, message'
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

    // Developer ID is optional - only validate if provided
    let validDeveloperId = null;
    if (developerId && developerId > 0) {
      // Verify that the developer exists
      const [developerExists] = await pool.query(
        'SELECT id FROM users WHERE id = ? AND role = ?',
        [developerId, 'developer']
      );

      if (developerExists.length === 0) {
        console.warn(`Developer validation: ID ${developerId} not found or is not a developer`);
        // Don't fail - just create project without developer assignment
        // Admin can assign developer later
        validDeveloperId = null;
      } else {
        validDeveloperId = developerId;
      }
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Step 1: Create project record
      // NOTE: We store the client's freeform request only in the `message` column.
      // Do NOT duplicate the client's `message` into the `description` column.

      const [projectResult] = await connection.query(
        `INSERT INTO projects (
          client_id, developer_id, title, description, location, building_type, budget_min, budget_max,
          start_date, duration, message, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          clientId,
          validDeveloperId, // May be null if no valid developer was selected
          projectName,
          '', // leave description empty for project requests — message goes to `message` only
          location,
          buildingType,
          budget_min || null,
          budget_max || null,
          startDate || null,
          duration || null,
          message,
          'open'
        ]
      );
      const projectId = projectResult.insertId;

      // Step 2: Create contract record linking developer to the project (only if developer was assigned)
      let contractId = null;
      if (validDeveloperId) {
        const [contractResult] = await connection.query(
          `INSERT INTO contracts (
            developer_id, project_id, agreed_amount, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, NOW(), NOW())`,
          [validDeveloperId, projectId, null, 'active']
        );
        contractId = contractResult.insertId;
      }

      // Step 3: Handle file upload if provided
      let mediaUrl = null;
      let filename = null;
      
      if (req.file) {
        try {
          // Get the directory structure
          const __dirname = path.dirname(fileURLToPath(import.meta.url));
          const uploadsDir = path.join(__dirname, '../../uploads');
          const projectsDir = path.join(uploadsDir, 'projects');
          const projectDir = path.join(projectsDir, String(projectId));

          // Create project-specific directory if it doesn't exist
          if (!fs.existsSync(projectDir)) {
            fs.mkdirSync(projectDir, { recursive: true });
          }

          // Move file from temp to project folder
          const tempFilePath = req.file.path;
          const newFilePath = path.join(projectDir, req.file.filename);
          fs.copyFileSync(tempFilePath, newFilePath);
          
          // Delete temp file
          fs.unlinkSync(tempFilePath);

          // Set media URL and filename for database
          mediaUrl = `/uploads/projects/${projectId}/${req.file.filename}`;
          filename = req.file.filename;
        } catch (fileErr) {
          console.error('Error moving uploaded file:', fileErr);
          // Don't fail the entire request if file move fails
          // Just log it and continue without the file
        }
      }

      // Step 4: If file was successfully processed, create project_media record
      if (mediaUrl && filename) {
        await connection.query(
          `INSERT INTO project_media (
            project_id, type, url, filename, mime_type, created_at
          ) VALUES (?, ?, ?, ?, ?, NOW())`,
          [projectId, 'site_plan', mediaUrl, filename, req.file.mimetype || 'application/octet-stream']
        );
      }

      await connection.commit();

      const logMsg = validDeveloperId 
        ? `✅ Project request created: projectId=${projectId}, contractId=${contractId}, developerId=${validDeveloperId}`
        : `✅ Project request created: projectId=${projectId}, no developer assigned (admin will assign later)`;
      console.info(logMsg);

      res.json({
        success: true,
        message: 'Project request submitted successfully',
        projectId,
        contractId: contractId || null,
        developerAssigned: !!validDeveloperId,
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
// Admin endpoint to assign developer to project (starts 72-hour acceptance window)
export const assignDeveloperToProject = async (req, res) => {
  const { projectId } = req.params;
  const { developer_id } = req.body;

  try {
    if (!developer_id) {
      return res.status(400).json({ error: 'Developer ID is required' });
    }

    // Verify project exists and get its details
    const [projectData] = await pool.query(
      'SELECT id, title, building_type, location, budget_min, budget_max, budget, duration FROM projects WHERE id = ?',
      [projectId]
    );

    if (projectData.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = projectData[0];

    // Assign developer: set developer_id, assigned_at (NOW), and acceptance_status = 'pending'
    await pool.query(
      `UPDATE projects 
       SET developer_id = ?, 
           assigned_at = NOW(), 
           acceptance_status = 'pending',
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [developer_id, projectId]
    );

    // Ensure contract exists with project details
    await ensureContractExists(projectId, project);

    console.log(`✅ Developer ${developer_id} assigned to project ${projectId} - 72h acceptance window started`);

    res.json({ 
      message: 'Developer assigned to project successfully',
      acceptance_deadline: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
    });
  } catch (error) {
    console.error('Error assigning developer:', error);
    res.status(500).json({ error: 'An error occurred while assigning developer' });
  }
};

// Admin endpoint to update project status
export const adminUpdateProject = async (req, res) => {
  const { projectId } = req.params;
  const { status } = req.body;

  try {
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const validStatuses = ['open', 'in_progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    await pool.query(
      'UPDATE projects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, projectId]
    );

    const [project] = await pool.query(
      'SELECT id, client_id, developer_id, title, status FROM projects WHERE id = ?',
      [projectId]
    );

    res.json({ message: 'Project updated successfully', project: project[0] });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ error: 'An error occurred while updating project' });
  }
};

// Admin endpoint to delete project
export const adminDeleteProject = async (req, res) => {
  const { projectId } = req.params;

  try {
    await pool.query('DELETE FROM projects WHERE id = ?', [projectId]);
    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'An error occurred while deleting project' });
  }
};

// Get projects assigned to a developer (with all details)
// Shows: pending assignments within 72 hours + accepted assignments
export const getDeveloperProjects = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    const developerId = decoded.userId || decoded.id;

    // Fetch projects assigned to this developer that are still in acceptance window or already accepted
    // Query logic:
    // 1. acceptance_status = 'accepted' (developer already accepted)
    // 2. OR acceptance_status = 'pending' AND assigned_at > NOW() - 72 HOURS (still in 72-hour window)
    const [projects] = await pool.query(
      `SELECT 
        id, 
        client_id, 
        title, 
        description, 
        location, 
        building_type, 
        budget, 
        budget_min, 
        budget_max, 
        start_date, 
        duration, 
        status,
        acceptance_status,
        assigned_at,
        created_at, 
        updated_at 
       FROM projects 
       WHERE developer_id = ? 
         AND (
           acceptance_status = 'accepted'
           OR (acceptance_status = 'pending' AND assigned_at > DATE_SUB(NOW(), INTERVAL 72 HOUR))
         )
       ORDER BY assigned_at DESC, created_at DESC`,
      [developerId]
    );

    // Enrich with client info
    const enrichedProjects = await Promise.all(
      (Array.isArray(projects) ? projects : []).map(async (project) => {
        const [clientData] = await pool.query(
          'SELECT id, name, email FROM users WHERE id = ?',
          [project.client_id]
        );

        // Get all project images for rotation
        const [media] = await pool.query(
          `SELECT id, url, filename, mime_type FROM project_media 
           WHERE project_id = ? AND (mime_type LIKE 'image/%' OR mime_type IS NULL OR filename LIKE '%.jpg%' OR filename LIKE '%.png%' OR filename LIKE '%.gif%')
           ORDER BY created_at DESC`,
          [project.id]
        );
        
        // Calculate time remaining for acceptance (if pending)
        let acceptance_deadline = null;
        let hours_remaining = null;
        
        if (project.acceptance_status === 'pending' && project.assigned_at) {
          acceptance_deadline = new Date(
            new Date(project.assigned_at).getTime() + 72 * 60 * 60 * 1000
          ).toISOString();
          
          const now = Date.now();
          const deadline = new Date(project.assigned_at).getTime() + 72 * 60 * 60 * 1000;
          hours_remaining = Math.max(0, Math.ceil((deadline - now) / (60 * 60 * 1000)));
        }
        
        return {
          ...project,
          client: clientData[0] || { id: project.client_id, name: 'Unknown Client' },
          acceptance_deadline,
          hours_remaining,
          media_array: Array.isArray(media) ? media : [] // All images for rotation
        };
      })
    );

    res.json({ success: true, projects: enrichedProjects });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    console.error('Error fetching developer projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
};

// Get all project media (documents) for a project
export const getProjectMedia = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    const userId = decoded.userId || decoded.id;
    const userRole = decoded.role || decoded.userRole;
    const projectId = req.params.projectId;

    // Get project to check access
    const [projects] = await pool.query(
      'SELECT id, client_id, developer_id FROM projects WHERE id = ?',
      [projectId]
    );

    if (projects.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = projects[0];
    
    // Check authorization - allow client, developer, or admin
    const isClient = project.client_id === userId;
    const isDeveloper = project.developer_id === userId;
    const isAdmin = userRole === 'admin' || userRole === 'sub_admin';

    if (!isClient && !isDeveloper && !isAdmin) {
      return res.status(403).json({ error: 'Unauthorized: You do not have access to this project' });
    }

    // Get all project media (all file types, not just images)
    const [media] = await pool.query(
      `SELECT id, project_id, type, url, filename, size, mime_type, created_at 
       FROM project_media 
       WHERE project_id = ? 
       ORDER BY created_at DESC`,
      [projectId]
    );

    res.json({
      success: true,
      media: Array.isArray(media) ? media : []
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    console.error('❌ getProjectMedia error:', error);
    res.status(500).json({ error: 'An error occurred while fetching project media', details: error.message });
  }
};

// Get contract documents for a project
export const getProjectContract = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    const userId = decoded.userId || decoded.id;
    const userRole = decoded.role || decoded.userRole;
    const projectId = req.params.projectId;

    // Get project to check access
    const [projects] = await pool.query(
      'SELECT id, client_id, developer_id FROM projects WHERE id = ?',
      [projectId]
    );

    if (projects.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = projects[0];
    
    // Check authorization - allow client, developer, or admin
    const isClient = project.client_id === userId;
    const isDeveloper = project.developer_id === userId;
    const isAdmin = userRole === 'admin' || userRole === 'sub_admin';

    if (!isClient && !isDeveloper && !isAdmin) {
      return res.status(403).json({ error: 'Unauthorized: You do not have access to this project' });
    }

    // Get contract details
    const [contracts] = await pool.query(
      `SELECT 
        id, 
        project_id, 
        developer_id,
        status, 
        contract_terms,
        needs_resign,
        developer_signature_url, 
        client_signature_url, 
        developer_signed_at, 
        client_signed_at,
        created_at,
        updated_at
       FROM contracts 
       WHERE project_id = ? 
       LIMIT 1`,
      [projectId]
    );

    const contract = contracts[0] || null;

    if (!contract) {
      return res.json({
        success: true,
        contract: null,
        documents: []
      });
    }

    // Build documents array from contract signatures
    const documents = [];
    
    // Check if both parties have signed
    const bothSigned = contract.developer_signature_url && contract.developer_signed_at && 
                       contract.client_signature_url && contract.client_signed_at;

    // If both parties have signed, add a combined contract document
    if (bothSigned) {
      documents.push({
        id: `contract-both-${contract.id}`,
        project_id: projectId,
        type: 'contract_signed',
        url: null, // This is a combined virtual document
        filename: `contract-fully-signed.pdf`,
        mime_type: 'application/pdf',
        signed_by: 'Both Parties',
        is_complete: true,
        developer_signature_url: contract.developer_signature_url,
        client_signature_url: contract.client_signature_url,
        developer_signed_at: contract.developer_signed_at,
        client_signed_at: contract.client_signed_at,
        signed_at: new Date(Math.max(new Date(contract.developer_signed_at).getTime(), new Date(contract.client_signed_at).getTime())),
        created_at: new Date(Math.max(new Date(contract.developer_signed_at).getTime(), new Date(contract.client_signed_at).getTime()))
      });
    }
    
    // Add individual signatures
    if (contract.developer_signature_url) {
      documents.push({
        id: `dev-sig-${contract.id}`,
        project_id: projectId,
        type: 'contract_signature',
        url: contract.developer_signature_url,
        filename: `developer-signature.png`,
        mime_type: 'image/png',
        signed_by: 'Developer',
        signed_at: contract.developer_signed_at,
        created_at: contract.developer_signed_at
      });
    }

    if (contract.client_signature_url) {
      documents.push({
        id: `client-sig-${contract.id}`,
        project_id: projectId,
        type: 'contract_signature',
        url: contract.client_signature_url,
        filename: `client-signature.png`,
        mime_type: 'image/png',
        signed_by: 'Client',
        signed_at: contract.client_signed_at,
        created_at: contract.client_signed_at
      });
    }

    res.json({
      success: true,
      contract: contract,
      documents: documents
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    console.error('❌ getProjectContract error:', error);
    res.status(500).json({ error: 'An error occurred while fetching contract documents', details: error.message });
  }
};

// Update contract details (admin only)
export const updateProjectContract = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    const userRole = decoded.role || decoded.userRole;
    const projectId = req.params.projectId;
    const { status, contract_terms } = req.body;

    // Check authorization - admin only
    const isAdmin = userRole === 'admin' || userRole === 'sub_admin';
    if (!isAdmin) {
      return res.status(403).json({ error: 'Unauthorized: Only admins can update contracts' });
    }

    // Get project to verify it exists
    const [projects] = await pool.query(
      'SELECT id FROM projects WHERE id = ?',
      [projectId]
    );

    if (projects.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get contract for this project
    const [contracts] = await pool.query(
      'SELECT id FROM contracts WHERE project_id = ? AND is_template = FALSE LIMIT 1',
      [projectId]
    );

    if (contracts.length === 0) {
      return res.status(404).json({ error: 'Contract not found for this project' });
    }

    const contractId = contracts[0].id;

    // Build update query dynamically based on provided fields
    const updateFields = [];
    const updateValues = [];

    if (status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(status);
    }

    if (contract_terms !== undefined) {
      updateFields.push('contract_terms = ?');
      updateValues.push(contract_terms);
      // If contract terms are being updated, set needs_resign flag
      updateFields.push('needs_resign = ?');
      updateValues.push(true);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields provided to update' });
    }

    // Add updated_at to all updates
    updateFields.push('updated_at = NOW()');

    // Add contractId as the last parameter for WHERE clause
    updateValues.push(contractId);

    // Update contract
    const updateQuery = `UPDATE contracts SET ${updateFields.join(', ')} WHERE id = ?`;
    await pool.query(updateQuery, updateValues);

    // Fetch and return updated contract
    const [updatedContracts] = await pool.query(
      `SELECT 
        id, 
        project_id, 
        developer_id,
        status, 
        contract_terms,
        needs_resign,
        developer_signature_url, 
        client_signature_url, 
        developer_signed_at, 
        client_signed_at,
        created_at,
        updated_at
       FROM contracts 
       WHERE id = ?`,
      [contractId]
    );

    const contract = updatedContracts[0];

    res.json({
      success: true,
      message: 'Contract updated successfully',
      contract: contract
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    console.error('❌ updateProjectContract error:', error);
    res.status(500).json({ error: 'An error occurred while updating the contract', details: error.message });
  }
};

// Delete a project contract
export const deleteProjectContract = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    const userRole = decoded.role || decoded.userRole;
    const projectId = req.params.projectId;

    // Check authorization - admin only
    const isAdmin = userRole === 'admin' || userRole === 'sub_admin';
    if (!isAdmin) {
      return res.status(403).json({ error: 'Unauthorized: Only admins can delete contracts' });
    }

    // Get contract for this project
    const [contracts] = await pool.query(
      'SELECT id FROM contracts WHERE project_id = ? AND is_template = FALSE LIMIT 1',
      [projectId]
    );

    if (contracts.length === 0) {
      return res.status(404).json({ error: 'Contract not found for this project' });
    }

    const contractId = contracts[0].id;

    // Delete contract
    await pool.query(
      'DELETE FROM contracts WHERE id = ?',
      [contractId]
    );

    console.log(`🗑️ Contract ${contractId} for project ${projectId} deleted successfully`);

    res.json({
      success: true,
      message: 'Contract deleted successfully'
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    console.error('❌ deleteProjectContract error:', error);
    res.status(500).json({ error: 'An error occurred while deleting the contract', details: error.message });
  }
};

// Get developer's active (accepted) projects for the "My Projects" / "Active Projects" page
export const getDeveloperActiveProjects = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    const developerId = decoded.userId || decoded.id;

    // Fetch only ACCEPTED projects assigned to this developer that are currently in progress
    const [projects] = await pool.query(
      `SELECT 
        p.id, 
        p.client_id, 
        p.title, 
        p.message,
        p.description,
        p.location, 
        p.building_type, 
        p.budget, 
        p.budget_min, 
        p.budget_max, 
        p.start_date, 
        p.duration, 
        p.status,
        p.acceptance_status,
        p.assigned_at,
        p.inspection_requested,
        p.created_at, 
        p.updated_at
       FROM projects p
       WHERE p.developer_id = ? AND p.acceptance_status = 'accepted' AND p.status = 'in_progress'
       ORDER BY p.updated_at DESC, p.created_at DESC`,
      [developerId]
    );

    // Enrich with client info and media
    const enrichedProjects = await Promise.all(
      (Array.isArray(projects) ? projects : []).map(async (project) => {
        const [clientData] = await pool.query(
          'SELECT id, name FROM users WHERE id = ?',
          [project.client_id]
        );
        
        // Get all project images for rotation
        const [media] = await pool.query(
          `SELECT id, url, filename, mime_type FROM project_media 
           WHERE project_id = ? AND (mime_type LIKE 'image/%' OR mime_type IS NULL OR filename LIKE '%.jpg%' OR filename LIKE '%.png%' OR filename LIKE '%.gif%')
           ORDER BY created_at DESC`,
          [project.id]
        );

        return {
          ...project,
          client_name: clientData?.[0]?.name || 'Client',
          media_array: Array.isArray(media) ? media : [] // All images for rotation
        };
      })
    );

    res.json({ success: true, projects: enrichedProjects });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    console.error('Error fetching developer active projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
};

// Developer accepts a project assignment
export const acceptProjectAssignment = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    const developerId = decoded.userId || decoded.id;
    const { projectId } = req.params;

    // Verify project is assigned to this developer and status is pending
    const [projectData] = await pool.query(
      'SELECT id, developer_id, acceptance_status, assigned_at FROM projects WHERE id = ?',
      [projectId]
    );

    if (projectData.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = projectData[0];

    if (project.developer_id !== developerId) {
      return res.status(403).json({ error: 'This project is not assigned to you' });
    }

    if (project.acceptance_status !== 'pending') {
      return res.status(400).json({ error: 'Project is not in pending acceptance status' });
    }

    // Check if within 72-hour window
    const assignedTime = new Date(project.assigned_at).getTime();
    const now = Date.now();
    if (now - assignedTime > 72 * 60 * 60 * 1000) {
      return res.status(400).json({ error: 'Acceptance period expired (72 hours)' });
    }

    // Update project and contract status to accepted
    await pool.query(
      `UPDATE projects 
       SET acceptance_status = 'accepted', 
           status = 'in_progress',
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [projectId]
    );

    // Update contract status to active
    await pool.query(
      `UPDATE contracts 
       SET status = 'active', updated_at = NOW()
       WHERE project_id = ? AND developer_id = ?`,
      [projectId, developerId]
    );

    console.log(`✅ Developer ${developerId} accepted project ${projectId} - Contract is now active`);

    res.json({ 
      success: true,
      message: 'Project assignment accepted successfully - Contract is ready for signature',
      project_id: projectId
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    console.error('Error accepting project:', error);
    res.status(500).json({ error: 'Failed to accept project assignment' });
  }
};

// Developer rejects a project assignment
export const rejectProjectAssignment = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    const developerId = decoded.userId || decoded.id;
    const { projectId } = req.params;

    // Verify project is assigned to this developer and status is pending
    const [projectData] = await pool.query(
      'SELECT id, developer_id, acceptance_status, assigned_at FROM projects WHERE id = ?',
      [projectId]
    );

    if (projectData.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = projectData[0];

    if (project.developer_id !== developerId) {
      return res.status(403).json({ error: 'This project is not assigned to you' });
    }

    if (project.acceptance_status !== 'pending') {
      return res.status(400).json({ error: 'Project is not in pending acceptance status' });
    }

    // Update project and contract status to rejected
    // Reset developer_id so admin can assign someone else
    // NOTE: Keep assigned_at intact for audit trail - only update acceptance_status and developer_id
    await pool.query(
      `UPDATE projects 
       SET acceptance_status = 'rejected', 
           developer_id = NULL,
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [projectId]
    );

    await pool.query(
      `UPDATE contracts 
       SET developer_id = NULL, status = 'cancelled'
       WHERE project_id = ?`,
      [projectId]
    );

    console.log(`❌ Developer ${developerId} rejected project ${projectId}`);

    res.json({ 
      success: true,
      message: 'Project assignment rejected. Admin can now reassign to another developer.',
      project_id: projectId
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    console.error('Error rejecting project:', error);
    res.status(500).json({ error: 'Failed to reject project assignment' });
  }
};

// Helper function: Expire pending project acceptances after 72 hours
export const expireProjectAcceptances = async () => {
  try {
    console.log('🔄 [Scheduled Job] Starting project acceptance expiry check...');
    const startTime = Date.now();

    // Find all pending projects where 72 hours have passed since assignment
    const [expiredProjects] = await pool.query(
      `SELECT id, developer_id, title, assigned_at, client_id FROM projects 
       WHERE acceptance_status = 'pending' 
         AND assigned_at IS NOT NULL
         AND assigned_at < DATE_SUB(NOW(), INTERVAL 72 HOUR)
       ORDER BY assigned_at ASC`
    );

    console.log(`📋 Found ${expiredProjects.length} expired project(s) pending acceptance`);

    if (expiredProjects.length === 0) {
      console.log('✓ No expired project acceptances found');
      return { expiredCount: 0, projects: [] };
    }

    // Log projects that will be expired
    expiredProjects.forEach(project => {
      const hoursExpired = Math.round((Date.now() - new Date(project.assigned_at).getTime()) / (1000 * 60 * 60));
      console.log(`   📌 Project ${project.id} (${project.title}) - Assigned ${hoursExpired} hours ago`);
    });

    // Set acceptance_status to 'expired' for projects that exceeded 72-hour window
    // Keep assigned_at and developer_id for audit trail
    const [result] = await pool.query(
      `UPDATE projects 
       SET acceptance_status = 'expired',
           updated_at = CURRENT_TIMESTAMP 
       WHERE acceptance_status = 'pending' 
         AND assigned_at IS NOT NULL
         AND assigned_at < DATE_SUB(NOW(), INTERVAL 72 HOUR)`
    );

    console.log(`⏰ Updated ${result.affectedRows} project(s) to 'expired' status`);

    // Create notifications for each expired project
    for (const project of expiredProjects) {
      try {
        // Get client name for better notification context
        const [clientData] = await pool.query(
          'SELECT name FROM users WHERE id = ?',
          [project.client_id]
        );
        const clientName = clientData[0]?.name || 'Unknown Client';

        // Create notification for the developer
        await createNotification(
          project.developer_id,
          'project_expired',
          '⏰ Project Request Expired',
          `You did not respond to the project request "${project.title}" from ${clientName} within 72 hours. The request has expired and will be reassigned.`,
          {
            project_id: project.id,
            project_title: project.title,
            client_name: clientName,
            assigned_at: project.assigned_at,
            reason: 'acceptance_timeout'
          }
        );

        console.log(`   📬 Notification sent to Developer ${project.developer_id} for Project ${project.id}`);
      } catch (notificationError) {
        console.error(`   ⚠️ Failed to create notification for Developer ${project.developer_id}:`, notificationError.message);
        // Continue processing other projects even if notification fails
      }
    }

    // Verify the update
    const [verifyProjects] = await pool.query(
      `SELECT id, acceptance_status FROM projects WHERE id IN (?)`,
      [expiredProjects.map(p => p.id)]
    );

    verifyProjects.forEach(project => {
      console.log(`   ✓ Project ${project.id} - Status: ${project.acceptance_status}`);
    });

    const duration = Date.now() - startTime;
    console.log(`✅ Project acceptance expiry check completed in ${duration}ms (${expiredProjects.length} projects expired, ${expiredProjects.length} notifications sent)\n`);

    return { 
      expiredCount: result.affectedRows, 
      projects: expiredProjects 
    };
  } catch (error) {
    console.error('❌ Error in expireProjectAcceptances:', error.message);
    console.error('   Stack:', error.stack);
    throw error;
  }
};

// Admin endpoint to manually check and update expired project acceptances
export const checkExpiredProjectAcceptances = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    const userRole = decoded.role || decoded.userRole;

    // Check authorization - admin only
    const isAdmin = userRole === 'admin' || userRole === 'sub_admin';
    if (!isAdmin) {
      return res.status(403).json({ error: 'Unauthorized: Only admins can check expired acceptances' });
    }

    // Call the helper function to expire projects
    const result = await expireProjectAcceptances();

    res.json({
      success: true,
      message: `Checked for expired acceptances. ${result.expiredCount} project(s) updated.`,
      expiredCount: result.expiredCount,
      expiredProjects: result.projects
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    console.error('❌ checkExpiredProjectAcceptances error:', error);
    res.status(500).json({ error: 'An error occurred while checking expired acceptances', details: error.message });
  }
};

// Get contract template
export const getContractTemplate = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');

    // Get the template row (available to all authenticated users)
    const [templates] = await pool.query(
      `SELECT id, contract_terms, created_at, updated_at FROM contracts WHERE is_template = TRUE LIMIT 1`
    );

    console.log('📄 getContractTemplate query result:', {
      found: templates.length > 0,
      templateCount: templates.length,
      hasContractTerms: templates.length > 0 && !!templates[0].contract_terms,
      termsLength: templates.length > 0 ? templates[0].contract_terms?.length : 0
    });

    if (templates.length === 0) {
      console.warn('⚠️ No contract template found in database');
      return res.status(404).json({ error: 'Contract template not found' });
    }

    const template = templates[0];

    console.log('✅ Contract template retrieved successfully');
    res.json({
      success: true,
      template: template
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    console.error('❌ getContractTemplate error:', error.message);
    console.error('   Stack:', error.stack);
    res.status(500).json({ error: 'An error occurred while fetching contract template', details: error.message });
  }
};

// Update contract template
export const updateContractTemplate = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    const userRole = decoded.role || decoded.userRole;
    const { contract_terms } = req.body;

    // Check authorization - admin only
    const isAdmin = userRole === 'admin' || userRole === 'sub_admin';
    if (!isAdmin) {
      return res.status(403).json({ error: 'Unauthorized: Only admins can update contract templates' });
    }

    if (!contract_terms) {
      return res.status(400).json({ error: 'contract_terms field is required' });
    }

    // Get the template row
    const [templates] = await pool.query(
      `SELECT id FROM contracts WHERE is_template = TRUE LIMIT 1`
    );

    if (templates.length === 0) {
      return res.status(404).json({ error: 'Contract template not found' });
    }

    const templateId = templates[0].id;

    // Update the template row
    await pool.query(
      `UPDATE contracts SET contract_terms = ?, updated_at = NOW() WHERE id = ?`,
      [contract_terms, templateId]
    );

    // Fetch and return updated template
    const [updatedTemplates] = await pool.query(
      `SELECT id, contract_terms, created_at, updated_at FROM contracts WHERE id = ?`,
      [templateId]
    );

    const template = updatedTemplates[0];

    res.json({
      success: true,
      message: 'Contract template updated successfully',
      template: template
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    console.error('❌ updateContractTemplate error:', error);
    res.status(500).json({ error: 'An error occurred while updating contract template', details: error.message });
  }
};

// Get all contracts with project details (admin view)
export const getAllContracts = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    const userRole = decoded.role || decoded.userRole;

    // Check authorization - admin only
    const isAdmin = userRole === 'admin' || userRole === 'sub_admin';
    if (!isAdmin) {
      return res.status(403).json({ error: 'Unauthorized: Only admins can view all contracts' });
    }

    // Get all contracts with project details using JOIN
    const [contracts] = await pool.query(
      `SELECT 
        c.id,
        c.project_id,
        c.status,
        c.contract_terms,
        c.needs_resign,
        c.developer_signature_url,
        c.client_signature_url,
        c.developer_signed_at,
        c.client_signed_at,
        c.created_at,
        c.updated_at,
        p.title AS project_title,
        p.budget_min,
        p.budget_max,
        p.budget,
        p.client_id,
        p.developer_id,
        p.assigned_at,
        p.acceptance_status,
        u.name AS developer_name,
        u.profile_image AS developer_profile_image
       FROM contracts c
       LEFT JOIN projects p ON c.project_id = p.id
       LEFT JOIN users u ON p.developer_id = u.id
       WHERE c.is_template = FALSE
       ORDER BY c.created_at DESC`
    );

    res.json({
      success: true,
      contracts: contracts || []
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    console.error('❌ getAllContracts error:', error);
    res.status(500).json({ error: 'An error occurred while fetching contracts', details: error.message });
  }
};

// Get single contract with project details by contract ID
export const getContractById = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    const userRole = decoded.role || decoded.userRole;
    const { contractId } = req.params;

    // Check authorization - admin only
    const isAdmin = userRole === 'admin' || userRole === 'sub_admin';
    if (!isAdmin) {
      return res.status(403).json({ error: 'Unauthorized: Only admins can view contracts' });
    }

    // Get contract with project details using JOIN
    const [contracts] = await pool.query(
      `SELECT 
        c.id,
        c.project_id,
        c.status,
        c.contract_terms,
        c.needs_resign,
        c.developer_signature_url,
        c.client_signature_url,
        c.developer_signed_at,
        c.client_signed_at,
        c.created_at,
        c.updated_at,
        p.title AS project_title,
        p.location,
        p.building_type,
        p.duration,
        p.budget_min,
        p.budget_max,
        p.budget,
        p.client_id,
        p.developer_id,
        p.assigned_at,
        u.name AS developer_name,
        u.profile_image AS developer_profile_image,
        uc.name AS client_name
       FROM contracts c
       LEFT JOIN projects p ON c.project_id = p.id
       LEFT JOIN users u ON p.developer_id = u.id
       LEFT JOIN users uc ON p.client_id = uc.id
       WHERE c.id = ? AND c.is_template = FALSE`,
      [contractId]
    );

    if (contracts.length === 0) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    const contract = contracts[0];

    res.json({
      success: true,
      contract: contract
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    console.error('❌ getContractById error:', error);
    res.status(500).json({ error: 'An error occurred while fetching contract', details: error.message });
  }
};