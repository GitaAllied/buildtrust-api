import jwt from 'jsonwebtoken';
import pool from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { sendPortfolioCreatedEmail } from '../services/email.js';
import { lookupIp } from '../services/ipGeo.js';

/**
 * Helper function to ensure upload directories exist
 */
const ensureUploadDirExists = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

/**
 * Helper function to save a file and return the URL
 * Handles both multer file objects (with .path) and raw file objects
 */
const saveUploadedFile = (file, uploadSubdir) => {
  const uploadsDir = path.join(process.cwd(), 'uploads', uploadSubdir);
  ensureUploadDirExists(uploadsDir);
  
  // If file already has a path from multer, move it to final location
  if (file.path) {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const filename = `${uniqueSuffix}-${file.originalname}`;
    const filepath = path.join(uploadsDir, filename);
    
    // Move file from temp location to final location
    try {
      fs.renameSync(file.path, filepath);
    } catch (err) {
      // If rename fails, try copy then delete
      fs.copyFileSync(file.path, filepath);
      fs.unlinkSync(file.path);
    }
    
    return `/uploads/${uploadSubdir}/${filename}`;
  }
  
  // Otherwise handle raw file data
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const filename = `${uniqueSuffix}-${file.originalname || file.filename}`;
  const filepath = path.join(uploadsDir, filename);
  
  fs.writeFileSync(filepath, file.data);
  return `/uploads/${uploadSubdir}/${filename}`;
};

/**
 * Complete portfolio setup - inserts data into all required tables
 * Tables: users, user_documents, user_skills, projects, project_media, project_skills, portfolios
 */
export const completePortfolioSetup = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    const userId = decoded.userId || decoded.id;

    console.info('\n========== 🚀 PORTFOLIO SETUP STARTED ==========');
    console.info('📨 Portfolio setup initiated');

    // Parse form data
    let personal = {};
    let preferences = {};
    let identityMetadata = {};
    let credentialsMetadata = {};
    const projectsData = {};
    const identityFiles = {};
    const credentialsFiles = {};
    const projectMediaFiles = {};

    // Parse form fields
    if (req.body.personal) {
      try {
        personal = typeof req.body.personal === 'string' ? JSON.parse(req.body.personal) : req.body.personal;
        console.info('📝 Personal data parsed');
      } catch (e) {
        console.error('❌ Error parsing personal data:', e.message);
      }
    } else {
      console.warn('⚠️ No personal data in req.body');
    }
    
    if (req.body.preferences) {
      try {
        preferences = typeof req.body.preferences === 'string' ? JSON.parse(req.body.preferences) : req.body.preferences;
        console.info('✓ Preferences parsed');
      } catch (e) {
        console.error('❌ Error parsing preferences:', e.message);
      }
    } else {
      console.warn('⚠️ No preferences in req.body');
    }
    
    if (req.body.identity_metadata) {
      identityMetadata = typeof req.body.identity_metadata === 'string' ? JSON.parse(req.body.identity_metadata) : req.body.identity_metadata;
    }
    if (req.body.credentials_metadata) {
      credentialsMetadata = typeof req.body.credentials_metadata === 'string' ? JSON.parse(req.body.credentials_metadata) : req.body.credentials_metadata;
    }

    // Organize uploaded files from multer
    console.info('📁 Files received count:', req.files ? req.files.length : 0);
    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files) {
        const fieldName = file.fieldname;
        // Queue files by type without logging original filenames
        if (fieldName.startsWith('identity_')) {
          const docType = fieldName.replace('identity_', '');
          identityFiles[docType] = file;
        } else if (fieldName.startsWith('credential_')) {
          const parts = fieldName.replace('credential_', '').split('_');
          const credType = parts.slice(0, -1).join('_');
          const idx = parts[parts.length - 1];
          if (!credentialsFiles[credType]) credentialsFiles[credType] = {};
          credentialsFiles[credType][idx] = file;
        } else if (fieldName.startsWith('project_')) {
          const parts = fieldName.replace('project_', '').split('_');
          const projIdx = parts[0];
          if (!projectsData[projIdx]) projectsData[projIdx] = {};
          if (fieldName.includes('_media_')) {
            if (!projectMediaFiles[projIdx]) projectMediaFiles[projIdx] = {};
            const mediaIdx = parts[parts.length - 1];
            projectMediaFiles[projIdx][mediaIdx] = file;
          }
        }
      }
    }

    // Also get project metadata from form fields (title, description, type, location, budget)
    for (const [key, value] of Object.entries(req.body || {})) {
      if (key.startsWith('project_')) {
        const parts = key.replace('project_', '').split('_');
        const projIdx = parts[0];
        if (!projectsData[projIdx]) projectsData[projIdx] = {};
        if (!key.includes('_media_')) {
          const fieldType = parts.slice(1).join('_');
          projectsData[projIdx][fieldType] = value;
        }
      }
    }
    
    console.info(`✓ Parsed ${Object.keys(projectsData).length} projects from form data`);

    console.info('\n📊 VALIDATION CHECK (non-PII):');
    console.info('  personal present:', Object.keys(personal).length > 0);
    
    if (!personal || Object.keys(personal).length === 0 || !userId) {
      console.error('❌ VALIDATION FAILED - Aborting operation');
      return res.status(400).json({ error: 'Missing required data (personal info or user ID)' });
    }

    // Extract IP address from request (x-forwarded-for, x-real-ip, socket)
    let extractedIp = null;
    try {
      const forwarded = req.headers['x-forwarded-for'] || req.headers['x-real-ip'];
      const remote = (req.socket && req.socket.remoteAddress) || req.connection?.remoteAddress || req.ip;
      extractedIp = forwarded ? String(forwarded).split(',')[0].trim() : (remote || '');
      // strip IPv6 prefix if present
      if (extractedIp && extractedIp.startsWith('::ffff:')) extractedIp = extractedIp.replace('::ffff:', '');
      if (extractedIp === '::1') extractedIp = '127.0.0.1';
    } catch (e) {
      console.warn('Could not extract IP from request headers', e.message);
      extractedIp = null;
    }

    // Lookup geolocation (state, country) for extracted IP (best-effort)
    let geo = null;
    if (extractedIp) {
      try {
        console.info('🔎 [Portfolio Setup] Starting geo lookup');
        geo = await lookupIp(extractedIp);
        console.info('🔎 [Portfolio Setup] Geo lookup completed');
      } catch (e) {
        console.error('❌ [Portfolio Setup] Geo lookup error:', e.message);
        geo = null;
      }
    }

    const connection = await pool.getConnection();
    
    try {
      // Start transaction
      await connection.beginTransaction();

      // Step 1: Update users table with profile information
      const updateUserData = {
        name: personal.fullName?.trim() || null,
        bio: personal.bio?.trim() || null,
        phone: personal.phoneNumber?.trim() || null,
        location: personal.currentLocation?.trim() || null,
      };

      // Attach IP and geo info when available
      if (extractedIp) {
        updateUserData.ip_address = extractedIp;
          console.info('✅ [Portfolio Setup] Setting ip_address (stored)');
      }
      
      if (geo) {
        if (geo.state) {
          updateUserData.current_state = geo.state;
          console.info('✅ [Portfolio Setup] Setting current_state');
        } else {
          console.warn('⚠️ [Portfolio Setup] geo.state is empty/null');
        }
        if (geo.country) {
          updateUserData.current_country = geo.country;
          console.info('✅ [Portfolio Setup] Setting current_country');
        } else {
          console.warn('⚠️ [Portfolio Setup] geo.country is empty/null');
        }
      } else {
        console.warn('⚠️ [Portfolio Setup] geo object is null/falsy');
      }

      // Add role-specific fields
      if (personal.role === 'developer') {
        updateUserData.company_type = personal.companyType || null;
        updateUserData.years_experience = personal.yearsExperience ? parseInt(personal.yearsExperience.split('-')[0]) : null;
        
        // Add preference fields from preferences object
        // Check if preferences exist first, then safely extract each field
        if (preferences) {
          console.info('🔍 Processing developer preferences (non-PII)');
          if (preferences.projectTypes !== undefined) {
            updateUserData.project_types = Array.isArray(preferences.projectTypes) ? JSON.stringify(preferences.projectTypes) : (preferences.projectTypes || null);
          }
          if (preferences.preferredCities !== undefined) {
            updateUserData.preferred_cities = Array.isArray(preferences.preferredCities) ? JSON.stringify(preferences.preferredCities) : (preferences.preferredCities || null);
          }
          if (preferences.budgetRange !== undefined) {
            updateUserData.budget_range = preferences.budgetRange || null;
          }
          if (preferences.workingStyle !== undefined) {
            updateUserData.working_style = preferences.workingStyle || null;
          }
          if (preferences.availability !== undefined) {
            updateUserData.availability = preferences.availability || null;
          }
          if (preferences.specializations !== undefined) {
            updateUserData.specializations = Array.isArray(preferences.specializations) ? JSON.stringify(preferences.specializations) : (preferences.specializations || null);
          }
        }
        
        // Add languages from personal data
        if (personal.languages && Array.isArray(personal.languages) && personal.languages.length > 0) {
          updateUserData.languages = JSON.stringify(personal.languages);
        }
      }

      // Build dynamic UPDATE query
      const updateFields = Object.entries(updateUserData)
        .filter(([_, value]) => value !== undefined)
        .map(([key]) => `${key} = ?`)
        .join(', ');
      
      const updateValues = Object.entries(updateUserData)
        .filter(([_, value]) => value !== undefined)
        .map(([_, value]) => value);

      console.info('📊 User data to update (fields count):', Object.keys(updateUserData).length);

      if (updateFields) {
        const updatedFields = Object.entries(updateUserData)
          .filter(([_, value]) => value !== undefined)
          .map(([key]) => key);
        console.info('✓ Updating users table with fields:', updatedFields);
        
        const [result] = await connection.query(
          `UPDATE users SET ${updateFields}, updated_at = NOW() WHERE id = ?`,
          [...updateValues, userId]
        );
        
        console.info(`✅ [DATABASE] Update result: affected=${result.affectedRows} changed=${result.changedRows}`);
        
        // Log what was actually stored
        console.info('✅ [DATABASE] User table updated');
      } else {
        console.warn('⚠️ No fields to update in users table');
      }

      // Step 2: Store identity documents in user_documents
      const identityDocTypes = [
        { key: 'id', type: 'government_id', dir: 'identity' },
        { key: 'cac', type: 'business_registration', dir: 'identity' },
        { key: 'selfie', type: 'selfie', dir: 'identity' }
      ];

      for (const { key, type, dir } of identityDocTypes) {
        let filename = null;
        let fileUrl = null;
        let fileSize = 0;

        // Check if we have an uploaded file from multer
        if (identityFiles[key]) {
          const file = identityFiles[key];
          fileUrl = saveUploadedFile(file, dir);
          filename = file.originalname || file.filename;
          fileSize = file.size || 0;
          console.info('✓ Identity file saved');
          
          // Insert into user_documents table
          await connection.query(
            `INSERT INTO user_documents (user_id, type, filename, url, metadata, verified, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [
              userId,
              type,
              filename,
              fileUrl,
              JSON.stringify({ size: fileSize, originalName: filename }),
              false
            ]
          );
        } else if (identityMetadata[key]) {
          // Use metadata if available (from previous localStorage without files)
          const meta = identityMetadata[key];
          filename = meta.name || null;
          fileSize = meta.size || 0;
          fileUrl = meta.url || `uploaded_${Date.now()}_${filename}`;
          
          if (filename) {
            await connection.query(
              `INSERT INTO user_documents (user_id, type, filename, url, metadata, verified, created_at)
               VALUES (?, ?, ?, ?, ?, ?, NOW())`,
              [
                userId,
                type,
                filename,
                fileUrl,
                JSON.stringify({ size: fileSize, originalName: filename }),
                false
              ]
            );
          }
        }
      }

      // Step 3: Store credentials (licenses, certifications, testimonials) in user_documents
      const credentialTypes = [
        { key: 'licenses', type: 'license', dir: 'licenses' },
        { key: 'certifications', type: 'certification', dir: 'certifications' },
        { key: 'testimonials', type: 'testimonial', dir: 'testimonials' }
      ];

      for (const { key, type, dir } of credentialTypes) {
        // Store uploaded files from multer
        if (credentialsFiles[key]) {
          for (const [idx, file] of Object.entries(credentialsFiles[key])) {
            const fileUrl = saveUploadedFile(file, dir);
            const filename = file.originalname || file.filename;
            const fileSize = file.size || 0;
            
            await connection.query(
              `INSERT INTO user_documents (user_id, type, filename, url, metadata, verified, created_at)
               VALUES (?, ?, ?, ?, ?, ?, NOW())`,
              [
                userId,
                type,
                filename,
                fileUrl,
                JSON.stringify({ size: fileSize, originalName: filename }),
                false
              ]
            );
            console.info('✓ Credential file saved');
          }
        }

        // Store metadata-only items (from localStorage)
        if (credentialsMetadata[key] && Array.isArray(credentialsMetadata[key])) {
          for (const item of credentialsMetadata[key]) {
            if (item && item.name) {
              await connection.query(
                `INSERT INTO user_documents (user_id, type, filename, url, metadata, verified, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                [
                  userId,
                  type,
                  item.name,
                  item.url || `uploaded_${Date.now()}_${item.name}`,
                  JSON.stringify({ size: item.size, originalName: item.name }),
                  false
                ]
              );
            }
          }
        }
      }

      // Step 4: Add specializations as skills
      if (preferences && preferences.specializations && Array.isArray(preferences.specializations)) {
        for (const specialization of preferences.specializations) {
          const trimmedSpec = specialization?.trim();
          if (trimmedSpec) {
            const [existingSkills] = await connection.query(
              `SELECT id FROM skills WHERE name = ?`,
              [trimmedSpec]
            );

            let skillId;
            if (existingSkills && existingSkills.length > 0) {
              skillId = existingSkills[0].id;
            } else {
              const [insertSkill] = await connection.query(
                `INSERT INTO skills (name, category, created_at)
                 VALUES (?, ?, NOW())`,
                [trimmedSpec, 'developer_specialization']
              );
              skillId = insertSkill.insertId;
            }

            if (skillId) {
              try {
                await connection.query(
                  `INSERT INTO user_skills (user_id, skill_id, proficiency_level, years_experience, created_at)
                   VALUES (?, ?, ?, ?, NOW())
                   ON DUPLICATE KEY UPDATE updated_at = NOW()`,
                  [userId, skillId, 'advanced', personal.yearsExperience ? parseInt(personal.yearsExperience.split('-')[0]) : null]
                );
              } catch (err) {
                console.info('Skill already linked');
              }
            }
          }
        }
      }

      // Step 5: Create portfolio projects with media
      const createdProjectIds = [];
      const projectIndices = Object.keys(projectsData).sort((a, b) => parseInt(a) - parseInt(b));

      for (const projIdx of projectIndices) {
        const project = projectsData[projIdx];
        
        if (project.title?.trim()) {
          console.info(`Creating project: ${project.title}`);

          const [insertProject] = await connection.query(
            `INSERT INTO projects (client_id, title, description, type, location, budget, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [
              userId,
              project.title?.trim() || null,
              project.description?.trim() || null,
              project.type || null,
              project.location?.trim() || null,
              project.budget || null,
              'open'
            ]
          );

          const projectId = insertProject.insertId;
          createdProjectIds.push(projectId);

          // Step 5a: Add project media files
          if (projectMediaFiles[projIdx]) {
            const mediaIndices = Object.keys(projectMediaFiles[projIdx]).sort((a, b) => parseInt(a) - parseInt(b));
            console.info(`Inserting ${mediaIndices.length} media files for a project`);

            for (const mediaIdx of mediaIndices) {
              const file = projectMediaFiles[projIdx][mediaIdx];
              try {
                const fileUrl = saveUploadedFile(file, `projects/${projectId}`);
                const filename = file.originalname || file.filename;
                const fileSize = file.size || 0;
                const mimeType = file.mimetype || 'application/octet-stream';

                await connection.query(
                  `INSERT INTO project_media (project_id, type, url, filename, size, mime_type, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                  [
                    projectId,
                    'portfolio_media',
                    fileUrl,
                    filename,
                    fileSize,
                    mimeType
                  ]
                );
                console.info('✓ Media inserted');
              } catch (mediaErr) {
                console.log('Error inserting project media:', mediaErr.message);
              }
            }
          }

          // Step 5b: Link project type skills
          if (project.type) {
            const [existingSkills] = await connection.query(
              `SELECT id FROM skills WHERE name = ?`,
              [project.type]
            );

            let skillId;
            if (existingSkills && existingSkills.length > 0) {
              skillId = existingSkills[0].id;
            } else {
              const [insertSkill] = await connection.query(
                `INSERT INTO skills (name, category, created_at)
                 VALUES (?, ?, NOW())`,
                [project.type, 'project_type']
              );
              skillId = insertSkill.insertId;
            }

            if (skillId) {
              try {
                await connection.query(
                  `INSERT INTO project_skills (project_id, skill_id, is_required, created_at)
                   VALUES (?, ?, ?, NOW())`,
                  [projectId, skillId, true]
                );
              } catch (err) {
                console.log('Project skill already exists');
              }
            }
          }
        }
      }

      // Step 6: Create portfolio entry
      if (preferences) {
        const [existingPortfolio] = await connection.query(
          `SELECT id FROM portfolios WHERE user_id = ?`,
          [userId]
        );

        if (existingPortfolio && existingPortfolio.length > 0) {
          await connection.query(
            `UPDATE portfolios SET description = ?, technologies = ?, updated_at = NOW() WHERE user_id = ?`,
            [
              personal.bio?.trim() || null,
              preferences.specializations && preferences.specializations.length > 0
                ? JSON.stringify(preferences.specializations)
                : null,
              userId
            ]
          );
        } else {
          await connection.query(
            `INSERT INTO portfolios (user_id, title, description, technologies, created_at, updated_at)
             VALUES (?, ?, ?, ?, NOW(), NOW())`,
            [
              userId,
              `${personal.fullName}'s Portfolio` || 'My Portfolio',
              personal.bio?.trim() || null,
              preferences.specializations && preferences.specializations.length > 0
                ? JSON.stringify(preferences.specializations)
                : null
            ]
          );
        }
      }

      // Step 7: Mark setup as complete, set initial trust score, and activate user
      await connection.query(
        `UPDATE users SET setup_completed = ?, trust_score = 25, is_active = 1, updated_at = NOW() WHERE id = ?`,
        [true, userId]
      );
      console.info('✅ [DATABASE] Setup completed, trust_score=25, and is_active=1');

      // Commit transaction
      await connection.commit();

      // Fetch user email and name for notification email
      const [userRows] = await connection.query(
        `SELECT id, email, name FROM users WHERE id = ?`,
        [userId]
      );
      
      const userData = userRows?.[0];
      const responseData = {
        message: 'Portfolio setup completed successfully',
        user_id: userId,
        summary: {
          identity_documents: Object.keys(identityFiles).length + Object.keys(identityMetadata).length,
          credentials_uploaded: Object.keys(credentialsFiles).reduce((sum, key) => sum + Object.keys(credentialsFiles[key]).length, 0),
          projects_created: createdProjectIds.length,
          specializations_added: preferences?.specializations?.length || 0,
          setup_completed: true
        },
        preferences_saved: {
          project_types: preferences?.projectTypes || [],
          preferred_cities: preferences?.preferredCities || [],
          budget_range: preferences?.budgetRange || null,
          working_style: preferences?.workingStyle || null,
          availability: preferences?.availability || null,
          specializations: preferences?.specializations || [],
          languages: personal?.languages || []
        }
      };

      console.info('✅ [API] Portfolio setup complete:', {
        user_id: userId,
        projects: responseData.summary.projects_created,
        documents: responseData.summary.identity_documents
      });

      // Send portfolio created email asynchronously (fire and forget)
      if (userData && userData.email) {
        console.info('📧 Sending portfolio created email');
        sendPortfolioCreatedEmail(
          userData.email,
          userData.name || 'Developer',
          userId
        ).catch(err => {
          console.error('Error sending portfolio email:', err.message);
          // Don't fail the response, just log the error
        });
      }

      res.json(responseData);

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    console.error('Portfolio setup error:', error);
    res.status(500).json({
      error: 'An error occurred while completing portfolio setup',
      details: error.message
    });
  }
};

export default { completePortfolioSetup };
