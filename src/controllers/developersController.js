import pool from '../config/database.js';
import { getDeveloperLocation } from '../services/geolocation.js';
import fs from 'fs';
import path from 'path';
import { resolveBackendPath } from '../utils/projectRoot.js';

/**
 * Get all developers with their portfolios and projects
 */
export const getDevelopers = async (req, res) => {
  try {
    const connection = await pool.getConnection();
    
    try {
      // Get client's IP address from request
      const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || '127.0.0.1';
      
      // Fetch all developers (users with role='developer' and setup_completed=true)
      const [developers] = await connection.query(
        `SELECT 
          id, 
          name, 
          email, 
          bio, 
          location, 
          ip_address,
          current_state,
          current_country,
          years_experience,
          company_type,
          email_verified,
          setup_completed,
          documents_verified,
          trust_score,
          created_at
        FROM users 
        WHERE role = 'developer' AND setup_completed = true
        ORDER BY created_at DESC`
      );

      // Enrich each developer with their portfolio and projects
      const enrichedDevelopers = await Promise.all(
        developers.map(async (dev) => {
          try {
            // Get user skills (specializations)
            const [skills] = await connection.query(
              `SELECT s.name FROM user_skills us
               JOIN skills s ON us.skill_id = s.id
               WHERE us.user_id = ? AND s.category = 'developer_specialization'
               LIMIT 5`,
              [dev.id]
            );

            // Get portfolio (all entries for past projects display)
            const [portfolios] = await connection.query(
              `SELECT id, title, description, technologies FROM portfolios WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
              [dev.id]
            );
            // Get all projects created by developer (from projects table)
            const [developerProjects] = await connection.query(
              `SELECT id as project_id, title, description, location, budget, project_type, status as project_status, estimated_hours, created_at as project_created_at
               FROM projects
               WHERE client_id = ?
               ORDER BY created_at DESC
               LIMIT 100`,
              [dev.id]
            );
            // Get projects via contracts (projects the developer worked on) with full media
            const [contractProjects] = await connection.query(
              `SELECT p.id as project_id, p.title, p.description, p.location, p.budget_min, p.budget_max, p.project_type, p.status as project_status, p.created_at as project_created_at, c.id as contract_id, c.status as contract_status, c.agreed_amount, c.start_date, c.end_date
               FROM contracts c
               JOIN projects p ON c.project_id = p.id
               WHERE c.developer_id = ?
               ORDER BY p.created_at DESC
               LIMIT 20`,
              [dev.id]
            );

            // Attach media for contract projects
            const contractProjectsWithMedia = await Promise.all(
              contractProjects.map(async (row) => {
                const [media] = await connection.query(
                  `SELECT id, url, filename, mime_type FROM project_media WHERE project_id = ? ORDER BY id ASC LIMIT 5`,
                  [row.project_id]
                );

                // For each media item check file existence on disk (best-effort)
                const mediaWithExists = (media || []).map((m) => {
                  const url = m && m.url ? m.url : m;
                  let exists = false;
                  try {
                    if (url && typeof url === 'string') {
                      // Remove leading slash if present
                      const rel = url.replace(/^\/+/, '');
                      const absPath = resolveBackendPath(rel);
                      exists = fs.existsSync(absPath);
                    }
                  } catch (e) {
                    exists = false;
                  }
                  return { ...m, exists };
                });

                const projectWithMedia = {
                  id: row.project_id,
                  title: row.title,
                  description: row.description,
                  project_type: row.project_type,
                  location: row.location,
                  budget: row.budget_min || row.budget_max || null,
                  completion_year: row.end_date ? new Date(row.end_date).getFullYear() : null,
                  status: row.project_status,
                  contract_id: row.contract_id,
                  contract_status: row.contract_status,
                  source: 'contract',
                  project_media: mediaWithExists,
                  media: mediaWithExists
                };
                console.info(`Project ${row.project_id} media count (getDevelopers):`, (mediaWithExists || []).length);
                return projectWithMedia;
              })
            );

            // Convert developer projects to same format with media
            const setupProjectsWithMedia = await Promise.all(developerProjects.map(async (row) => {
              const [media] = await connection.query(
                `SELECT id, url, filename, mime_type FROM project_media WHERE project_id = ? ORDER BY id ASC LIMIT 5`,
                [row.project_id]
              );

              const mediaWithExists = (media || []).map((m) => {
                const url = m && m.url ? m.url : m;
                let exists = false;
                try {
                  if (url && typeof url === 'string') {
                    const rel = url.replace(/^\/+/, '');
                    const absPath = resolveBackendPath(rel);
                    exists = fs.existsSync(absPath);
                  }
                } catch (e) {
                  exists = false;
                }
                return { ...m, exists };
              });

              return {
                id: row.project_id,
                title: row.title,
                description: row.description,
                project_type: row.project_type,
                location: row.location,
                budget: row.budget,
                completion_year: row.project_created_at ? new Date(row.project_created_at).getFullYear() : null,
                status: row.project_status,
                estimated_hours: row.estimated_hours,
                contract_id: null,
                contract_status: null,
                source: 'portfolio',
                project_media: mediaWithExists,
                media: mediaWithExists
              };
            }));

            // Merge both project sources (contracts + setup)
            const projectsWithMedia = [...contractProjectsWithMedia, ...setupProjectsWithMedia];

            // Completed projects count for this developer
            const [completedRow] = await connection.query(
              `SELECT COUNT(*) as completed FROM contracts WHERE developer_id = ? AND status = 'completed'`,
              [dev.id]
            );
            const completedProjectsCount = (completedRow && completedRow[0] && completedRow[0].completed) || 0;

            // Get user documents for verification (count only)
            const [docs] = await connection.query(
              `SELECT COUNT(*) as count FROM user_documents 
               WHERE user_id = ? AND verified = true`,
              [dev.id]
            );

            // Get location from database or fetch from IP if null
            const locationData = await getDeveloperLocation(dev, connection, clientIP);
            const finalLocation = locationData.location || 'Nigeria';

            // Calculate transparency score based on profile completeness
            let transparencyScore = 0;
            if (dev.name) transparencyScore += 15;
            if (dev.bio) transparencyScore += 15;
            if (finalLocation && finalLocation !== 'Nigeria') transparencyScore += 10;
            if (dev.years_experience) transparencyScore += 10;
            if (dev.company_type) transparencyScore += 10;
            if (skills.length > 0) transparencyScore += 15;
            if (projectsWithMedia.length > 0) transparencyScore += 15;
            if (docs && docs[0] && docs[0].count > 0) transparencyScore += 10;

            return {
              id: dev.id,
              name: dev.name || 'Developer',
              email: dev.email || '',
              location: finalLocation,
              state: locationData.state,
              country: locationData.country,
              experience: dev.years_experience || 0,
              transparencyScore: Math.min(transparencyScore, 100),
              verified: dev.email_verified === true,
              documents_verified: dev.documents_verified || 0,
              bio: dev.bio || 'Professional developer',
              projects: projectsWithMedia.map(p => ({
                id: p.id,
                title: p.title,
                type: p.project_type || p.type,
                source: p.source,
                media: p.media || [],
                project_media: p.project_media || p.media || [],
                image: (Array.isArray(p.media) && p.media.length > 0) ? (p.media[0].url || p.media[0]) : '/placeholder.svg',
                description: p.description,
                location: p.location,
                budget: p.budget
              })),
              specializations: skills.map(s => s.name),
              portfolio: portfolios.length > 0 ? portfolios[0] : null,
              rating: 4.5,
              completed_projects: completedProjectsCount,
              verified_documents: docs && docs[0] ? docs[0].count : 0
            };
          } catch (err) {
            console.error(`Error enriching developer ${dev.id}:`, err.message);
            // Return minimal developer object on error for this specific dev
            const locationData = await getDeveloperLocation(dev, connection, clientIP).catch(() => ({
              location: 'Nigeria',
              state: null,
              country: 'Nigeria'
            }));
            return {
              id: dev.id,
              name: dev.name || 'Developer',
              email: dev.email || '',
              location: locationData.location || 'Nigeria',
              state: locationData.state,
              country: locationData.country,
              experience: dev.years_experience || 0,
              transparencyScore: 30,
              verified: dev.email_verified === true,
              bio: dev.bio || 'Professional developer',
              projects: [],
              specializations: [],
              portfolio: null,
              rating: 0,
              completed_projects: 0,
              verified_documents: 0
            };
          }
        })
      );

      res.json({
        success: true,
        count: enrichedDevelopers.length,
        developers: enrichedDevelopers
      });

    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Error fetching developers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch developers',
      details: error.message
    });
  }
};

/**
 * Get a single developer with full profile details
 */
export const getDeveloperById = async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();
    
    try {
      // Get client's IP address from request
      const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || '127.0.0.1';
      
      // Get developer info
      const [developers] = await connection.query(
        `SELECT * FROM users WHERE id = ? AND role = 'developer'`,
        [id]
      );

      if (developers.length === 0) {
        return res.status(404).json({ error: 'Developer not found' });
      }

      const dev = developers[0];
      // -- Skills / Specializations
      const [skills] = await connection.query(
        `SELECT s.name FROM user_skills us
         JOIN skills s ON us.skill_id = s.id
         WHERE us.user_id = ?`,
        [id]
      );

      // -- Portfolio (all entries for complete portfolio display)
      const [portfolios] = await connection.query(
        `SELECT id, title, description, technologies FROM portfolios WHERE user_id = ? ORDER BY created_at DESC`,
        [id]
      );
      // -- All projects created by developer (from projects table)
      const [developerProjects] = await connection.query(
        `SELECT id as project_id, title, description, location, budget, project_type, status as project_status, estimated_hours, created_at as project_created_at
         FROM projects
         WHERE client_id = ?
         ORDER BY created_at DESC
         LIMIT 100`,
        [id]
      );
      // -- Contracts + Projects: fetch projects developer worked on (via contracts)
      const [contracts] = await connection.query(
        `SELECT p.id as project_id, p.title, p.description, p.location, p.budget, p.project_type, p.status as project_status, p.created_at as project_created_at, c.id as contract_id, c.status as contract_status, c.agreed_amount, c.start_date, c.end_date
         FROM contracts c
         JOIN projects p ON c.project_id = p.id
         WHERE c.developer_id = ?
         ORDER BY p.created_at DESC
         LIMIT 50`,
        [id]
      );

      // Attach media for contract projects
      const contractProjectsWithMedia = await Promise.all(
        contracts.map(async (row) => {
          const [media] = await connection.query(
            `SELECT id, url, filename, mime_type FROM project_media WHERE project_id = ? ORDER BY id ASC`,
            [row.project_id]
          );

          const mediaWithExists = (media || []).map((m) => {
            const url = m && m.url ? m.url : m;
            let exists = false;
            try {
              if (url && typeof url === 'string') {
                const rel = url.replace(/^\/+/, '');
                const absPath = resolveBackendPath(rel);
                exists = fs.existsSync(absPath);
              }
            } catch (e) {
              exists = false;
            }
            return { ...m, exists };
          });

          const projectWithMedia = {
            id: row.project_id,
            title: row.title,
            description: row.description,
            project_type: row.project_type,
            location: row.location,
            budget: row.budget,
            completion_year: row.end_date ? new Date(row.end_date).getFullYear() : null,
            status: row.project_status,
            contract_id: row.contract_id,
            contract_status: row.contract_status,
            source: 'contract',
            project_media: mediaWithExists,
            media: mediaWithExists
          };
          console.info(`Project ${row.project_id} media count (getDeveloperById):`, (mediaWithExists || []).length);
          return projectWithMedia;
        })
      );

      // Convert developer projects to same format with media
      const setupProjectsWithMedia = await Promise.all(developerProjects.map(async (row) => {
        const [media] = await connection.query(
          `SELECT id, url, filename, mime_type FROM project_media WHERE project_id = ? ORDER BY id ASC`,
          [row.project_id]
        );

        const mediaWithExists = (media || []).map((m) => {
          const url = m && m.url ? m.url : m;
          let exists = false;
          try {
            if (url && typeof url === 'string') {
              const rel = url.replace(/^\/+/, '');
              const absPath = resolveBackendPath(rel);
              exists = fs.existsSync(absPath);
            }
          } catch (e) {
            exists = false;
          }
          return { ...m, exists };
        });

        return {
          id: row.project_id,
          title: row.title,
          description: row.description,
          project_type: row.project_type,
          location: row.location,
          budget: row.budget,
          completion_year: row.project_created_at ? new Date(row.project_created_at).getFullYear() : null,
          status: row.project_status,
          estimated_hours: row.estimated_hours,
          contract_id: null,
          contract_status: null,
          source: 'portfolio',
          project_media: mediaWithExists,
          media: mediaWithExists
        };
      }));

      // Merge both sources
      const projectsWithMedia = [...contractProjectsWithMedia, ...setupProjectsWithMedia];

      // -- Documents / Licenses (user_documents)
      const [docs] = await connection.query(
        `SELECT id, type, filename, url, verified, created_at FROM user_documents WHERE user_id = ? ORDER BY type`,
        [id]
      );

      // -- Reviews: public reviews about this developer (clients -> developer)
      const [reviews] = await connection.query(
        `SELECT r.id, r.reviewer_id, u.name as client_name, r.project_id, r.contract_id, r.rating, r.comment, r.created_at
         FROM reviews r
         LEFT JOIN users u ON r.reviewer_id = u.id
         WHERE r.reviewee_id = ? AND r.review_type = 'client_to_developer' AND r.is_public = TRUE
         ORDER BY r.created_at DESC
         LIMIT 50`,
        [id]
      );

      // Get location from database or fetch from IP if null
      const locationData = await getDeveloperLocation(dev, connection, clientIP);
      const finalLocation = locationData.location || 'Nigeria';

      // Compute average rating and completed projects count
      let avgRating = 0;
      if (Array.isArray(reviews) && reviews.length > 0) {
        const sum = reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0);
        avgRating = sum / reviews.length;
      } else {
        avgRating = Number(dev.rating) || 0;
      }

      // Completed projects count: use contracts table where developer_id and contract.status = 'completed'
      const [completedRow] = await connection.query(
        `SELECT COUNT(*) as completed FROM contracts WHERE developer_id = ? AND status = 'completed'`,
        [id]
      );
      const completedProjectsCount = (completedRow && completedRow[0] && completedRow[0].completed) || dev.completed_projects || 0;

      // Build response object mapping DB columns to frontend-friendly fields
      const responseDeveloper = {
        id: dev.id,
        name: dev.name,
        contact_person: dev.name,
        is_verified: dev.email_verified === 1 || dev.email_verified === true,
        documents_verified: dev.documents_verified || 0,
        location: finalLocation,
        state: locationData.state,
        country: locationData.country,
        bio: dev.bio,
        rating: Number(avgRating.toFixed(2)),
        completed_projects: Number(completedProjectsCount),
        years_experience: dev.years_experience,
        trust_score: dev.trust_score || null,
        response_time: dev.response_time || null,
        languages: dev.languages ? (typeof dev.languages === 'string' ? JSON.parse(dev.languages || '[]') : dev.languages) : [],
        cities_covered: dev.preferred_cities ? (typeof dev.preferred_cities === 'string' ? JSON.parse(dev.preferred_cities || '[]') : dev.preferred_cities) : [],
        build_types: dev.project_types ? (typeof dev.project_types === 'string' ? JSON.parse(dev.project_types || '[]') : dev.project_types) : [],
        skills: skills.map(s => s.name),
        portfolio: portfolios.length > 0 ? portfolios[0] : null,
        projects: projectsWithMedia,
        documents: docs,
        licenses: docs.filter(d => /cac|license|certificat|licen/i.test(d.type || d.filename || '')),
        reviews: reviews.map(r => ({
          id: r.id,
          client_name: r.client_name,
          project_id: r.project_id,
          contract_id: r.contract_id,
          rating: r.rating,
          comment: r.comment,
          review_date: r.created_at
        }))
      };

      res.json({ success: true, developer: responseDeveloper });

    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Error fetching developer:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch developer',
      details: error.message
    });
  }
};

/**
 * Save a developer for the logged-in client
 */
export const saveDeveloper = async (req, res) => {
  try {
    const { developer_id } = req.body;
    const client_id = req.user.userId || req.user.id;

    if (!developer_id) {
      return res.status(400).json({ error: 'Developer ID is required' });
    }

    if (!client_id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Verify the developer exists
    const [developer] = await pool.query(
      'SELECT id FROM users WHERE id = ? AND role = "developer"',
      [developer_id]
    );

    if (!developer || developer.length === 0) {
      return res.status(404).json({ error: 'Developer not found' });
    }

    // Check if already saved
    const [existing] = await pool.query(
      'SELECT id FROM saved_developers WHERE client_id = ? AND developer_id = ?',
      [client_id, developer_id]
    );

    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'Developer already saved' });
    }

    // Save the developer
    await pool.query(
      'INSERT INTO saved_developers (client_id, developer_id) VALUES (?, ?)',
      [client_id, developer_id]
    );

    res.json({ message: 'Developer saved successfully' });
  } catch (error) {
    console.error('Error saving developer:', error);
    res.status(500).json({ error: 'Failed to save developer', details: error.message });
  }
};

/**
 * Unsave a developer for the logged-in client
 */
export const unsaveDeveloper = async (req, res) => {
  try {
    const { developer_id } = req.body;
    const client_id = req.user.userId || req.user.id;

    if (!developer_id) {
      return res.status(400).json({ error: 'Developer ID is required' });
    }

    if (!client_id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Delete the saved developer record
    const result = await pool.query(
      'DELETE FROM saved_developers WHERE client_id = ? AND developer_id = ?',
      [client_id, developer_id]
    );

    if (result[0].affectedRows === 0) {
      return res.status(404).json({ error: 'Saved developer not found' });
    }

    res.json({ message: 'Developer removed from saved list' });
  } catch (error) {
    console.error('Error unsaving developer:', error);
    res.status(500).json({ error: 'Failed to unsave developer', details: error.message });
  }
};

/**
 * Check if a developer is saved by the logged-in client
 */
export const checkIfDeveloperSaved = async (req, res) => {
  try {
    const { id } = req.params;
    const client_id = req.user.userId || req.user.id;

    if (!client_id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const [saved] = await pool.query(
      'SELECT id FROM saved_developers WHERE client_id = ? AND developer_id = ?',
      [client_id, id]
    );

    res.json({ is_saved: saved && saved.length > 0 });
  } catch (error) {
    console.error('Error checking if developer is saved:', error);
    res.status(500).json({ error: 'Failed to check save status', details: error.message });
  }
};

/**
 * Get all saved developers for the logged-in client
 */
export const getSavedDevelopers = async (req, res) => {
  try {
    const client_id = req.user.userId || req.user.id;

    if (!client_id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const [saved] = await pool.query(
      `SELECT sd.developer_id as id, u.name, u.email, u.location, u.bio, u.profile_image
       FROM saved_developers sd
       JOIN users u ON sd.developer_id = u.id
       WHERE sd.client_id = ?
       ORDER BY sd.created_at DESC`,
      [client_id]
    );

    res.json(saved || []);
  } catch (error) {
    console.error('Error fetching saved developers:', error);
    res.status(500).json({ error: 'Failed to fetch saved developers', details: error.message });
  }
};

export default { getDevelopers, getDeveloperById, saveDeveloper, unsaveDeveloper, checkIfDeveloperSaved, getSavedDevelopers };
