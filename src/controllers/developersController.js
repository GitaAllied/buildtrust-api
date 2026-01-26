import pool from '../config/database.js';

/**
 * Get all developers with their portfolios and projects
 */
export const getDevelopers = async (req, res) => {
  try {
    const connection = await pool.getConnection();
    
    try {
      // Fetch all developers (users with role='developer' and setup_completed=true)
      const [developers] = await connection.query(
        `SELECT 
          id, 
          name, 
          email, 
          bio, 
          location, 
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

            // Get portfolio
            const [portfolios] = await connection.query(
              `SELECT title, description, technologies FROM portfolios WHERE user_id = ? LIMIT 1`,
              [dev.id]
            );

            // Get projects (all projects where user is owner)
            const [projects] = await connection.query(
              `SELECT p.id, p.title, p.description, p.type, p.location, p.budget, p.status
               FROM projects p
               WHERE p.user_id = ? OR p.client_id = ?
               LIMIT 10`,
              [dev.id, dev.id]
            );

            // Get media for each project
            const projectsWithMedia = await Promise.all(
              projects.map(async (project) => {
                const [media] = await connection.query(
                  `SELECT id, url, filename FROM project_media 
                   WHERE project_id = ? 
                   LIMIT 1`,
                  [project.id]
                );
                return {
                  ...project,
                  media: media.length > 0 ? media[0] : null
                };
              })
            );

            // Get user documents for verification (count only)
            const [docs] = await connection.query(
              `SELECT COUNT(*) as count FROM user_documents 
               WHERE user_id = ? AND verified = true`,
              [dev.id]
            );

            // Calculate transparency score based on profile completeness
            let transparencyScore = 0;
            if (dev.name) transparencyScore += 15;
            if (dev.bio) transparencyScore += 15;
            if (dev.location) transparencyScore += 10;
            if (dev.years_experience) transparencyScore += 10;
            if (dev.company_type) transparencyScore += 10;
            if (skills.length > 0) transparencyScore += 15;
            if (projectsWithMedia.length > 0) transparencyScore += 15;
            if (docs && docs[0] && docs[0].count > 0) transparencyScore += 10;

            return {
              id: dev.id,
              name: dev.name || 'Developer',
              location: dev.location || 'Nigeria',
              experience: dev.years_experience || 0,
              transparencyScore: Math.min(transparencyScore, 100),
              verified: dev.email_verified === true,
              bio: dev.bio || 'Professional developer',
              projects: projectsWithMedia.map(p => ({
                id: p.id,
                title: p.title,
                type: p.type,
                image: p.media?.url || '/placeholder.svg',
                description: p.description,
                location: p.location,
                budget: p.budget
              })),
              specializations: skills.map(s => s.name),
              portfolio: portfolios.length > 0 ? portfolios[0] : null,
              rating: 4.5,
              completedProjects: 0,
              verified_documents: docs && docs[0] ? docs[0].count : 0
            };
          } catch (err) {
            console.error(`Error enriching developer ${dev.id}:`, err.message);
            // Return minimal developer object on error for this specific dev
            return {
              id: dev.id,
              name: dev.name || 'Developer',
              location: dev.location || 'Nigeria',
              experience: dev.years_experience || 0,
              transparencyScore: 30,
              verified: dev.email_verified === true,
              bio: dev.bio || 'Professional developer',
              projects: [],
              specializations: [],
              portfolio: null,
              rating: 0,
              completedProjects: 0,
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
      // Get developer info
      const [developers] = await connection.query(
        `SELECT * FROM users WHERE id = ? AND role = 'developer'`,
        [id]
      );

      if (developers.length === 0) {
        return res.status(404).json({ error: 'Developer not found' });
      }

      const dev = developers[0];

      // Get all associated data (same as above)
      const [skills] = await connection.query(
        `SELECT s.name FROM user_skills us
         JOIN skills s ON us.skill_id = s.id
         WHERE us.user_id = ?`,
        [id]
      );

      const [portfolio] = await connection.query(
        `SELECT * FROM portfolios WHERE user_id = ?`,
        [id]
      );

      const [projects] = await connection.query(
        `SELECT * FROM projects WHERE client_id = ? ORDER BY created_at DESC`,
        [id]
      );

      const projectsWithMedia = await Promise.all(
        projects.map(async (project) => {
          const [media] = await connection.query(
            `SELECT * FROM project_media WHERE project_id = ?`,
            [project.id]
          );
          return { ...project, media };
        })
      );

      const [docs] = await connection.query(
        `SELECT * FROM user_documents WHERE user_id = ? ORDER BY type`,
        [id]
      );

      res.json({
        success: true,
        developer: {
          ...dev,
          skills,
          portfolio: portfolio.length > 0 ? portfolio[0] : null,
          projects: projectsWithMedia,
          documents: docs
        }
      });

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
