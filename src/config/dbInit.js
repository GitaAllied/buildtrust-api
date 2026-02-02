import bcrypt from 'bcryptjs';
import pool from './database.js';

export async function initializeDatabase() {
  try {
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      name VARCHAR(255),
      role VARCHAR(255) NOT NULL DEFAULT 'client',
      profile_image VARCHAR(500),
      bio TEXT,
      phone VARCHAR(20),
      is_active BOOLEAN DEFAULT TRUE,
      email_verified BOOLEAN DEFAULT FALSE,
      last_login TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_email (email),
      INDEX idx_role (role),
      INDEX idx_is_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Ensure role column is VARCHAR(255) (idempotent)
    await pool.query("ALTER TABLE users MODIFY COLUMN role VARCHAR(255) NOT NULL DEFAULT 'client'");

    // Allow name to be optional (nullable)
    await pool.query("ALTER TABLE users MODIFY COLUMN name VARCHAR(255) NULL");

    // Create sessions table for token management
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token VARCHAR(500) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_token (token),
        INDEX idx_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create email_verification_tokens table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_verification_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_token (token),
        INDEX idx_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create password_reset_tokens table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_token (token),
        INDEX idx_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create skills table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS skills (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        category VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_name (name),
        INDEX idx_category (category)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create user_skills table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_skills (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        skill_id INT NOT NULL,
        proficiency_level ENUM('beginner', 'intermediate', 'advanced', 'expert') DEFAULT 'beginner',
        years_experience INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_skill (user_id, skill_id),
        INDEX idx_user_id (user_id),
        INDEX idx_skill_id (skill_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create projects table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        budget_min DECIMAL(10,2),
        budget_max DECIMAL(10,2),
        deadline DATE,
        status ENUM('open', 'in_progress', 'completed', 'cancelled') DEFAULT 'open',
        project_type ENUM('fixed_price', 'hourly') DEFAULT 'fixed_price',
        estimated_hours INT,
        required_experience ENUM('entry', 'intermediate', 'expert') DEFAULT 'intermediate',
        location VARCHAR(255),
        is_remote BOOLEAN DEFAULT TRUE,
        attachments JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_client_id (client_id),
        INDEX idx_status (status),
        INDEX idx_project_type (project_type),
        INDEX idx_is_remote (is_remote),
        FULLTEXT idx_title_description (title, description)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create project_skills table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_skills (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        skill_id INT NOT NULL,
        is_required BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
        UNIQUE KEY unique_project_skill (project_id, skill_id),
        INDEX idx_project_id (project_id),
        INDEX idx_skill_id (skill_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create applications table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS applications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        developer_id INT NOT NULL,
        proposal TEXT NOT NULL,
        bid_amount DECIMAL(10,2),
        estimated_days INT,
        status ENUM('pending', 'accepted', 'rejected', 'withdrawn') DEFAULT 'pending',
        attachments JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (developer_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_application (project_id, developer_id),
        INDEX idx_project_id (project_id),
        INDEX idx_developer_id (developer_id),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create contracts table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contracts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        developer_id INT NOT NULL,
        application_id INT,
        agreed_amount DECIMAL(10,2) NOT NULL,
        agreed_days INT,
        start_date DATE,
        end_date DATE,
        status ENUM('active', 'completed', 'terminated', 'disputed') DEFAULT 'active',
        milestones JSON,
        payment_terms TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (developer_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL,
        INDEX idx_project_id (project_id),
        INDEX idx_developer_id (developer_id),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create conversations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        participant1_id INT NOT NULL,
        participant2_id INT NOT NULL,
        last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (participant1_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (participant2_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_participant1 (participant1_id),
        INDEX idx_participant2 (participant2_id),
        INDEX idx_last_message (last_message_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create messages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        conversation_id INT NOT NULL,
        sender_id INT NOT NULL,
        content TEXT NOT NULL,
        message_type ENUM('text', 'file', 'image') DEFAULT 'text',
        attachments JSON,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_conversation_id (conversation_id),
        INDEX idx_sender_id (sender_id),
        INDEX idx_created_at (created_at),
        INDEX idx_is_read (is_read)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create payments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        contract_id INT NOT NULL,
        payer_id INT NOT NULL,
        payee_id INT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        payment_type ENUM('milestone', 'final', 'deposit') DEFAULT 'milestone',
        status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
        transaction_id VARCHAR(255),
        payment_method VARCHAR(100),
        notes TEXT,
        due_date DATE,
        paid_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE,
        FOREIGN KEY (payer_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (payee_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_contract_id (contract_id),
        INDEX idx_payer_id (payer_id),
        INDEX idx_payee_id (payee_id),
        INDEX idx_status (status),
        INDEX idx_due_date (due_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create reviews table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id INT AUTO_INCREMENT PRIMARY KEY,
        reviewer_id INT NOT NULL,
        reviewee_id INT NOT NULL,
        project_id INT,
        contract_id INT,
        rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        review_type ENUM('client_to_developer', 'developer_to_client') NOT NULL,
        is_public BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (reviewee_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL,
        INDEX idx_reviewer_id (reviewer_id),
        INDEX idx_reviewee_id (reviewee_id),
        INDEX idx_project_id (project_id),
        INDEX idx_contract_id (contract_id),
        INDEX idx_rating (rating),
        INDEX idx_review_type (review_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create portfolios table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS portfolios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        project_url VARCHAR(500),
        github_url VARCHAR(500),
        images JSON,
        technologies JSON,
        start_date DATE,
        end_date DATE,
        is_featured BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_is_featured (is_featured),
        FULLTEXT idx_title_description (title, description)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create notifications table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        type VARCHAR(100) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT,
        data JSON,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_type (type),
        INDEX idx_is_read (is_read),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create saved_developers table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS saved_developers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL,
        developer_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (developer_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_save (client_id, developer_id),
        INDEX idx_client_id (client_id),
        INDEX idx_developer_id (developer_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create user_documents table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        type VARCHAR(50) NOT NULL,
        filename VARCHAR(255),
        url VARCHAR(1000) NOT NULL,
        size INT,
        metadata JSON,
        verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_type (type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Add portfolio fields to projects table for developer portfolios
    try {
      await pool.query(`ALTER TABLE projects ADD COLUMN type VARCHAR(50)`);
    } catch (error) {
      if (!(error.message.includes('Duplicate column name'))) {
        throw error;
      }
    }

    try {
      await pool.query(`ALTER TABLE projects ADD COLUMN budget VARCHAR(50)`);
    } catch (error) {
      if (!(error.message.includes('Duplicate column name'))) {
        throw error;
      }
    }

    // Create project_media table for portfolio project media (images, videos)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_media (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        type VARCHAR(50) DEFAULT 'media',
        url VARCHAR(1000) NOT NULL,
        filename VARCHAR(255),
        size INT,
        mime_type VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        INDEX idx_project_id (project_id),
        INDEX idx_type (type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Add additional columns to users table if they don't exist
    const additionalUserColumns = [
      'phone VARCHAR(20)',
      'location VARCHAR(255)',
      'website VARCHAR(500)',
      'linkedin VARCHAR(500)',
      'github VARCHAR(500)',
      'hourly_rate DECIMAL(8,2)',
      'availability_status ENUM("available", "busy", "unavailable") DEFAULT "available"',
      'years_experience VARCHAR(255) DEFAULT NULL',
      'completed_projects INT DEFAULT 0',
      'rating DECIMAL(3,2) DEFAULT 0.00',
      'total_reviews INT DEFAULT 0',
      'trust_score INT DEFAULT NULL',
      'setup_completed BOOLEAN DEFAULT FALSE',
      'preferred_contact VARCHAR(50)',
      'company_type VARCHAR(255)',
      'project_types TEXT',  // JSON array
      'preferred_cities TEXT',  // JSON array
      'languages TEXT', // JSON array of spoken languages
      'budget_range VARCHAR(50)',
      'working_style VARCHAR(255)',
      'availability VARCHAR(50)',
      'specializations TEXT',  // JSON array
      'ip_address VARCHAR(45)',
      'current_state VARCHAR(255)',
      'current_country VARCHAR(255)'
    ];

    for (const column of additionalUserColumns) {
      try {
        await pool.query(`ALTER TABLE users ADD COLUMN ${column}`);
      } catch (error) {
        if (!(error.message.includes('Duplicate column name'))) {
          throw error;
        }
      }
    }

    // Add bio column if missing
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN bio TEXT`);
    } catch (error) {
      if (!(error.message.includes('Duplicate column name'))) {
        throw error;
      }
    }

    // Add email_verified column to users table
    try {
      await pool.query(`
        ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE
      `);
    } catch (error) {
      // Column might already exist, ignore error
      if (!(error.message.includes('Duplicate column name'))) {
        throw error;
      }
    }

    // Ensure sensible defaults and non-null constraints where safe
    try {
      // Role default
      await pool.query("UPDATE users SET role = 'client' WHERE role IS NULL");
      await pool.query("ALTER TABLE users MODIFY COLUMN role VARCHAR(255) NOT NULL DEFAULT 'client'");
    } catch (err) {
      // ignore errors (e.g. column already has desired definition)
    }

    try {
      // Email must be not null
      await pool.query("UPDATE users SET email = '' WHERE email IS NULL");
      await pool.query("ALTER TABLE users MODIFY COLUMN email VARCHAR(255) NOT NULL");
    } catch (err) {
      // ignore
    }

    try {
      // Boolean flags
      await pool.query("UPDATE users SET setup_completed = 0 WHERE setup_completed IS NULL");
      await pool.query("ALTER TABLE users MODIFY COLUMN setup_completed BOOLEAN NOT NULL DEFAULT FALSE");
      await pool.query("UPDATE users SET email_verified = 0 WHERE email_verified IS NULL");
      await pool.query("ALTER TABLE users MODIFY COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE");
    } catch (err) {
      // ignore
    }

    try {
      // Numeric defaults - allow years_experience to be nullable since it's optional during setup
      // And convert to VARCHAR(255) to store experience range strings like "4-7", "8-15", etc.
      await pool.query("ALTER TABLE users MODIFY COLUMN years_experience VARCHAR(255) NULL");
    } catch (err) {
      // ignore
    }

    try {
      // JSON/text arrays: set empty JSON array if missing (TEXT columns cannot have defaults)
      await pool.query("UPDATE users SET project_types = '[]' WHERE project_types IS NULL OR project_types = ''");

      await pool.query("UPDATE users SET preferred_cities = '[]' WHERE preferred_cities IS NULL OR preferred_cities = ''");

      await pool.query("UPDATE users SET languages = '[]' WHERE languages IS NULL OR languages = ''");

      await pool.query("UPDATE users SET specializations = '[]' WHERE specializations IS NULL OR specializations = ''");
    } catch (err) {
      // ignore
    }

    try {
      // Enforce not-null on key profile columns where appropriate but keep them nullable when needed
      await pool.query("ALTER TABLE users MODIFY COLUMN company_type VARCHAR(255)");
      await pool.query("ALTER TABLE users MODIFY COLUMN preferred_contact VARCHAR(50)");
    } catch (err) {
      // ignore
    }

    // Tighten user_documents columns
    try {
      await pool.query("ALTER TABLE user_documents MODIFY COLUMN filename VARCHAR(255) NOT NULL");
      await pool.query("ALTER TABLE user_documents MODIFY COLUMN url VARCHAR(1000) NOT NULL");
    } catch (err) {
      // ignore
    }

    // Create form_submissions table for auditing form submissions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS form_submissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        route VARCHAR(255) NOT NULL,
        method VARCHAR(10) NOT NULL,
        status INT NOT NULL,
        request_body JSON NULL,
        request_query JSON NULL,
        response_body JSON NULL,
        user_agent VARCHAR(500) NULL,
        ip_address VARCHAR(45) NULL,
        email VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_route (route),
        INDEX idx_method (method),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Add missing columns to form_submissions if they don't exist (migration)
    try {
      await pool.query(`ALTER TABLE form_submissions ADD COLUMN request_body JSON NULL`);
    } catch (e) {
      // Column already exists
    }
    try {
      await pool.query(`ALTER TABLE form_submissions ADD COLUMN request_query JSON NULL`);
    } catch (e) {
      // Column already exists
    }
    try {
      await pool.query(`ALTER TABLE form_submissions ADD COLUMN response_body JSON NULL`);
    } catch (e) {
      // Column already exists
    }
    try {
      await pool.query(`ALTER TABLE form_submissions ADD COLUMN user_agent VARCHAR(500) NULL`);
    } catch (e) {
      // Column already exists
    }
    try {
      await pool.query(`ALTER TABLE form_submissions ADD COLUMN ip_address VARCHAR(45) NULL`);
    } catch (e) {
      // Column already exists
    }
    try {
      await pool.query(`ALTER TABLE form_submissions ADD COLUMN email VARCHAR(255) NULL`);
    } catch (e) {
      // Column already exists
    }

    // Create default admin user if it doesn't exist
    try {
      const [existingAdmin] = await pool.query(
        'SELECT id FROM users WHERE email = ? AND role = ?',
        ['admin@gmail.com', 'admin']
      );

      if (!Array.isArray(existingAdmin) || existingAdmin.length === 0) {
        // Hash the default admin password
        const hashedPassword = await bcrypt.hash('12345', 10);
        
        await pool.query(
          'INSERT INTO users (email, password, name, role, email_verified) VALUES (?, ?, ?, ?, TRUE)',
          ['admin@gmail.com', hashedPassword, 'Admin', 'admin']
        );
        
        console.info('✅ Default admin user created');
      } else {
        console.info('ℹ️ Default admin user already exists');
      }
    } catch (adminError) {
      console.error('⚠️ Error creating default admin user:', adminError.message);
      // Don't throw - let initialization continue even if admin creation fails
    }

    console.info('✅ Database tables initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    throw error;
  }
}
