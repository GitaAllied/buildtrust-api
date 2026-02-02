import pool from '../config/database.js';
import { getDeveloperLocation } from '../services/geolocation.js';
import fs from 'fs';
import path from 'path';

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
                      const absPath = path.join(process.cwd(), rel);
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

            // Convert portfolio projects (from setup) to same format
            const setupProjectsWithMedia = await Promise.all(portfolios.map(async (portfolio) => {
              // Parse images JSON from portfolio
              let portfolioImages = [];
              if (portfolio.images) {
                try {
                  const images = typeof portfolio.images === 'string' ? JSON.parse(portfolio.images) : portfolio.images;
                  if (Array.isArray(images)) {
                    portfolioImages = images.map(img => ({
                      url: typeof img === 'string' ? img : img.url || img,
                      filename: typeof img === 'object' ? img.filename : null,
                      mime_type: typeof img === 'object' ? img.mime_type : null
                    }));
                  }
                } catch (e) {
                  console.warn(`Failed to parse portfolio ${portfolio.id} images:`, e.message);
                }
              }

              // Also attempt to fetch any project_media rows that reference this portfolio id
              let pmRows = [];
              try {
                const [pm] = await connection.query(
                  `SELECT id, url, filename, mime_type FROM project_media WHERE project_id = ? ORDER BY id ASC LIMIT 10`,
                  [portfolio.id]
                );
                pmRows = pm || [];
              } catch (e) {
                // ignore
                pmRows = [];
              }

              // Normalize pmRows (check file existence)
              const pmWithExists = (pmRows || []).map((m) => {
                const url = m && m.url ? m.url : m;
                let exists = false;
                try {
                  if (url && typeof url === 'string') {
                    const rel = url.replace(/^\\+/, '');
                    const absPath = path.join(process.cwd(), rel);
                    exists = fs.existsSync(absPath);
                  }
                } catch (e) {
                  exists = false;
                }
                return { ...m, exists };
              });

              // Merge portfolioImages (from portfolios.images JSON) with any project_media rows found
              const mergedMedia = [...(portfolioImages || []), ...pmWithExists];

              return {
                id: `portfolio-${portfolio.id}`,
                title: portfolio.title || 'Portfolio Project',
                description: portfolio.description || '',
                project_type: portfolio.technologies ? portfolio.technologies : 'Portfolio',
                location: null,
                budget: null,
                completion_year: portfolio.end_date ? new Date(portfolio.end_date).getFullYear() : null,
                status: 'completed',
                contract_id: null,
                contract_status: null,
                source: 'portfolio',
                project_media: mergedMedia,
                media: mergedMedia
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
              location: finalLocation,
              state: locationData.state,
              country: locationData.country,
              experience: dev.years_experience || 0,
              transparencyScore: Math.min(transparencyScore, 100),
              verified: dev.email_verified === true,
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
                const absPath = path.join(process.cwd(), rel);
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

      // Convert portfolio projects to same format
      const setupProjectsWithMedia = await Promise.all(portfolios.map(async (portfolio) => {
        // Parse images JSON from portfolio
        let portfolioImages = [];
        if (portfolio.images) {
          try {
            const images = typeof portfolio.images === 'string' ? JSON.parse(portfolio.images) : portfolio.images;
            if (Array.isArray(images)) {
              portfolioImages = images.map(img => ({
                url: typeof img === 'string' ? img : img.url || img,
                filename: typeof img === 'object' ? img.filename : null,
                mime_type: typeof img === 'object' ? img.mime_type : null
              }));
            }
          } catch (e) {
            console.warn(`Failed to parse portfolio ${portfolio.id} images:`, e.message);
          }
        }

        // Also attempt to fetch any project_media rows that reference this portfolio id
        let pmRows = [];
        try {
          const [pm] = await connection.query(
            `SELECT id, url, filename, mime_type FROM project_media WHERE project_id = ? ORDER BY id ASC`,
            [portfolio.id]
          );
          pmRows = pm || [];
        } catch (e) {
          pmRows = [];
        }

        // Normalize pmRows (check file existence)
        const pmWithExists = (pmRows || []).map((m) => {
          const url = m && m.url ? m.url : m;
          let exists = false;
          try {
            if (url && typeof url === 'string') {
              const rel = url.replace(/^\\+/, '');
              const absPath = path.join(process.cwd(), rel);
              exists = fs.existsSync(absPath);
            }
          } catch (e) {
            exists = false;
          }
          return { ...m, exists };
        });

        const mergedMedia = [...(portfolioImages || []), ...pmWithExists];

        return {
          id: `portfolio-${portfolio.id}`,
          title: portfolio.title || 'Portfolio Project',
          description: portfolio.description || '',
          project_type: portfolio.technologies ? portfolio.technologies : 'Portfolio',
          location: null,
          budget: null,
          completion_year: portfolio.end_date ? new Date(portfolio.end_date).getFullYear() : null,
          status: 'completed',
          contract_id: null,
          contract_status: null,
          source: 'portfolio',
          project_media: mergedMedia,
          media: mergedMedia
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

export default { getDevelopers, getDeveloperById };
