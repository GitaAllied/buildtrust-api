import pool from '../config/database.js';

export const getUsers = async (req, res) => {
  try {
    const [results] = await pool.query('SELECT id, email, name, role, email_verified, setup_completed, documents_verified, created_at, phone, location, current_state, current_country, ip_address, is_active, bio, website, last_login, is_online, last_seen, session_active, profile_image FROM users');
    
    // Return users with their actual online status from database
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while fetching users' });
  }
};

export const getUser = async (req, res) => {
  const { userId } = req.params;

  try {
    const [results] = await pool.query('SELECT id, email, name, role, email_verified, setup_completed, documents_verified, created_at, phone, location, current_state, current_country, ip_address, is_active, bio, website, last_login, profile_image FROM users WHERE id = ?', [userId]);
    
    if (results.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = results[0];
    
    // Fetch user skills if any
    const [skillResults] = await pool.query(`
      SELECT s.name FROM user_skills us
      JOIN skills s ON us.skill_id = s.id
      WHERE us.user_id = ?
    `, [userId]);
    
    user.skills = skillResults.map(s => s.name);
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while fetching user' });
  }
};

export const updateUser = async (req, res) => {
  const { userId } = req.params;
  const { name, email, role, phone, location, is_active, bio, website, email_verified, skills } = req.body;

  try {
    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      values.push(email);
    }
    if (role !== undefined) {
      updates.push('role = ?');
      values.push(role);
    }
    if (phone !== undefined) {
      updates.push('phone = ?');
      values.push(phone);
    }
    if (location !== undefined) {
      updates.push('location = ?');
      values.push(location);
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(is_active);
    }
    if (bio !== undefined) {
      updates.push('bio = ?');
      values.push(bio);
    }
    if (website !== undefined) {
      updates.push('website = ?');
      values.push(website);
    }
    if (email_verified !== undefined) {
      updates.push('email_verified = ?');
      values.push(email_verified);
    }

    if (updates.length === 0 && !skills) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Update user fields
    if (updates.length > 0) {
      values.push(userId);
      const query = `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      await pool.query(query, values);
    }

    // Handle skills update if provided
    if (skills) {
      // Delete existing skills for this user
      await pool.query('DELETE FROM user_skills WHERE user_id = ?', [userId]);
      
      // Add new skills
      if (Array.isArray(skills) && skills.length > 0) {
        for (const skillName of skills) {
          // Get or create skill
          const [skillResults] = await pool.query('SELECT id FROM skills WHERE name = ?', [skillName.trim()]);
          let skillId;
          
          if (skillResults.length === 0) {
            const [insertResult] = await pool.query('INSERT INTO skills (name) VALUES (?)', [skillName.trim()]);
            skillId = insertResult.insertId;
          } else {
            skillId = skillResults[0].id;
          }
          
          // Add user skill
          await pool.query('INSERT INTO user_skills (user_id, skill_id) VALUES (?, ?)', [userId, skillId]);
        }
      }
    }
    
    // Fetch and return updated user with skills
    const [userResults] = await pool.query('SELECT id, email, name, role, email_verified, setup_completed, documents_verified, created_at, phone, location, current_state, current_country, ip_address, is_active, bio, website, last_login, profile_image FROM users WHERE id = ?', [userId]);
    
    if (userResults.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResults[0];
    
    // Fetch user skills
    const [skillResults] = await pool.query(`
      SELECT s.name FROM user_skills us
      JOIN skills s ON us.skill_id = s.id
      WHERE us.user_id = ?
    `, [userId]);
    
    user.skills = skillResults.map(s => s.name);
    
    res.json(user);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'An error occurred while updating user' });
  }
};

export const deleteUser = async (req, res) => {
  const { userId } = req.params;

  try {
    await pool.query('DELETE FROM users WHERE id = ?', [userId]);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while deleting user' });
  }
};

export const updateProfileImage = async (req, res) => {
  const { userId } = req.params;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Save the public path to the uploaded file
    const publicPath = `/uploads/profile_images/${req.file.filename}`;

    await pool.query('UPDATE users SET profile_image = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [publicPath, userId]);

    const [userResults] = await pool.query('SELECT id, email, name, role, email_verified, setup_completed, documents_verified, created_at, phone, location, current_state, current_country, ip_address, is_active, bio, website, last_login, profile_image FROM users WHERE id = ?', [userId]);

    if (userResults.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResults[0];

    // Fetch user skills
    const [skillResults] = await pool.query(`
      SELECT s.name FROM user_skills us
      JOIN skills s ON us.skill_id = s.id
      WHERE us.user_id = ?
    `, [userId]);
    
    user.skills = skillResults.map(s => s.name);

    res.json(user);
  } catch (error) {
    console.error('Error updating profile image:', error);
    res.status(500).json({ error: 'An error occurred while updating profile image' });
  }
};

export default { getUsers, getUser, updateUser, deleteUser };