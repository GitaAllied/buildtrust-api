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
      is_online BOOLEAN DEFAULT FALSE,
      last_seen TIMESTAMP NULL,
      session_active BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_email (email),
      INDEX idx_role (role),
      INDEX idx_is_active (is_active),
      INDEX idx_is_online (is_online)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Ensure role column is VARCHAR(255) (idempotent)
    await pool.query("ALTER TABLE users MODIFY COLUMN role VARCHAR(255) NOT NULL DEFAULT 'client'");

    // Allow name to be optional (nullable)
    await pool.query("ALTER TABLE users MODIFY COLUMN name VARCHAR(255) NULL");

    // Add online status tracking columns (use compatible syntax for older MySQL)
    try {
      await pool.query("ALTER TABLE users ADD COLUMN is_online BOOLEAN DEFAULT FALSE");
    } catch (err) {
      // Column already exists
    }
    try {
      await pool.query("ALTER TABLE users ADD COLUMN session_active BOOLEAN DEFAULT FALSE");
    } catch (err) {
      // Column already exists
    }

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
        developer_id INT,
        title VARCHAR(255) NOT NULL,
        description TEXT NULL,
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
        FOREIGN KEY (developer_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_client_id (client_id),
        INDEX idx_developer_id (developer_id),
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
        project_id INT,
        is_template BOOLEAN DEFAULT FALSE,
        status ENUM('active', 'completed', 'terminated', 'disputed') DEFAULT 'active',
        contract_terms LONGTEXT,
        developer_signature_url VARCHAR(1000) DEFAULT NULL,
        client_signature_url VARCHAR(1000) DEFAULT NULL,
        developer_signed_at TIMESTAMP NULL DEFAULT NULL,
        client_signed_at TIMESTAMP NULL DEFAULT NULL,
        needs_resign BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        INDEX idx_project_id (project_id),
        INDEX idx_status (status),
        INDEX idx_is_template (is_template)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Ensure contract_terms and needs_resign columns exist
    const contractColumns = [
      'contract_terms LONGTEXT',
      'needs_resign BOOLEAN DEFAULT FALSE',
      'is_template BOOLEAN DEFAULT FALSE'
    ];

    for (const column of contractColumns) {
      try {
        await pool.query(`ALTER TABLE contracts ADD COLUMN ${column}`);
      } catch (err) {
        // Column already exists or other harmless error
      }
    }

    // Make project_id and developer_id nullable (safe to run multiple times)
    try {
      await pool.query(`ALTER TABLE contracts MODIFY COLUMN project_id INT NULL`);
    } catch (err) {
      // Already nullable
    }

    // Drop developer_id column from contracts (use projects.developer_id instead)
    try {
      await pool.query(`ALTER TABLE contracts DROP COLUMN IF EXISTS developer_id`);
    } catch (err) {
      // Column doesn't exist or other harmless error
    }

    // Drop application_id column from contracts
    try {
      await pool.query(`ALTER TABLE contracts DROP COLUMN IF EXISTS application_id`);
    } catch (err) {
      // Column doesn't exist or other harmless error
    }

    // Create or ensure the template row exists
    try {
      const [templateRows] = await pool.query(
        'SELECT id FROM contracts WHERE is_template = TRUE LIMIT 1'
      );

      if (templateRows.length === 0) {
        // Insert default template row if it doesn't exist
        const defaultTemplate = `BUILDTRUST SERVICE AGREEMENT & LEGAL CONTRACT

1. PARTIES & SCOPE
This binding contract is entered into between: (a) Client as Project Owner, (b) Developer as Service Provider, and (c) BuildTrust Africa as Platform Facilitator. Developer agrees to provide construction/development services as specified below within mutually agreed scope and timeline.

2. PROJECT SCOPE & DELIVERABLES
Developer is responsible for quality workmanship, adherence to specifications, timely completion, regular progress updates, and site safety compliance. Any work outside this scope requires written approval and separate agreement.

3. AGREED CONTRACT VALUE & PAYMENT TERMS
Payments are released in milestones upon verified completion of project phases. Client shall make payments within 7 days of invoice. Late payments incur 2% monthly interest. Disputes over payment must be raised within 30 days of invoice.

4. PERFORMANCE & LIABILITY
Developer warrants professional execution of all work. Developer carries liability insurance covering worksite accidents and property damage. BuildTrust provides platform mediation but does not assume contractor liability. Client liability is limited to contract value only. Maximum dispute compensation is the project fee paid.

5. BREACH & REMEDIES
Developer Breach: Failure to meet quality standards, missing deadlines without documented cause, or abandonment results in: (i) work withholding, (ii) contract termination with 5-day notice, (iii) funds forfeiture, (iv) negative platform rating, and (v) potential legal action for damages. Client Breach: Non-payment beyond 14 days allows Developer to: (i) suspend work, (ii) charge storage/holding fees, or (iii) terminate contract and pursue legal collection.

6. DISPUTE RESOLUTION
All disputes are first referred to BuildTrust's mediation team (14-day resolution window). If unresolved, disputes proceed to arbitration in accordance with applicable laws of the project jurisdiction. Both parties waive right to pursue claims outside this platform unless arbitration fails. Legal fees are borne by the breaching party.

7. TERMINATION & CANCELLATION
Client may cancel with 14-day notice and 20% fee forfeiture if no work commenced. Developer may terminate only for non-payment after 7-day written notice. Premature termination by either party may result in damages claim equal to 15% of remaining contract value plus verified costs incurred.

8. CONFIDENTIALITY & IP RIGHTS
Both parties shall maintain confidentiality of project specifications and sensitive information. Client retains all intellectual property rights to designs and plans. Developer may list project in portfolio only with written Client consent. Breach of confidentiality allows immediate contract termination and damages.

9. INSURANCE & COMPLIANCE
Developer must maintain liability insurance (minimum coverage based on project scope). Developer is responsible for all regulatory compliance, permits, and licenses. Developer indemnifies Client and BuildTrust against third-party claims. Failure to maintain insurance voids all protections under this contract.

10. LEGAL JURISDICTION
This contract is governed by the laws of the project location jurisdiction. Both parties submit to BuildTrust's platform policies and applicable legal frameworks. Enforcement is through platform arbitration initially, then civil courts if necessary. All notices must be in writing via registered platform messages.

11. PLATFORM PROTECTIONS
BuildTrust Africa holds funds in escrow, releasing only upon verified milestone completion. BuildTrust verifies developer credentials and maintains dispute records. BuildTrust may freeze accounts for violations. By signing, both parties agree to BuildTrust's terms of service and dispute resolution process. BuildTrust's liability is limited to fund safeguarding only.

⚠️ LEGAL NOTICE - BINDING CONTRACT
By affixing your digital signature, you acknowledge: (1) You have read and understood this entire contract, (2) You have legal authority to execute this agreement, (3) You consent to electronic signatures as legally binding, (4) You accept all terms including breach remedies and legal jurisdiction, (5) Any disputes will follow platform arbitration before court proceedings. This is a legally enforceable contract.`;

        await pool.query(
          'INSERT INTO contracts (project_id, developer_id, is_template, status, contract_terms) VALUES (NULL, NULL, TRUE, "active", ?)',
          [defaultTemplate]
        );
      }
    } catch (err) {
      console.log('Template row setup note:', err.message);
    }

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

    // Create payment_methods table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_methods (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        cardholder_name VARCHAR(255),
        card_brand VARCHAR(100),
        last4 VARCHAR(4),
        exp_month TINYINT,
        exp_year SMALLINT,
        is_default TINYINT DEFAULT 0,
        token VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_is_default (is_default)
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

    // Add message column for storing client messages from project requests
    try {
      await pool.query(`ALTER TABLE projects ADD COLUMN message TEXT`);
    } catch (error) {
      if (!(error.message.includes('Duplicate column name'))) {
        throw error;
      }
    }

    // Add client request metadata columns
    try {
      await pool.query(`ALTER TABLE projects ADD COLUMN building_type VARCHAR(100)`);
      await pool.query(`ALTER TABLE projects ADD COLUMN start_date DATE`);
      await pool.query(`ALTER TABLE projects ADD COLUMN duration VARCHAR(50)`);
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
      // Add decline_reason column for document rejection tracking
      await pool.query("ALTER TABLE user_documents ADD COLUMN decline_reason TEXT NULL");
    } catch (err) {
      // ignore if column already exists
    }

    // Add documents_verified column to users table for tracking developer document verification status
    try {
      await pool.query("ALTER TABLE users ADD COLUMN documents_verified BOOLEAN DEFAULT FALSE");
    } catch (err) {
      // ignore if column already exists
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

    // Add status column to conversations table if it doesn't exist (migration)
    try {
      await pool.query(`ALTER TABLE conversations ADD COLUMN status ENUM('active', 'archived') DEFAULT 'active'`);
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
      }
    } catch (adminError) {
      console.error('⚠️ Error creating default admin user:', adminError.message);
      // Don't throw - let initialization continue even if admin creation fails
    }

    // Create support_categories table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS support_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        color VARCHAR(7) DEFAULT '#3B82F6',
        is_active BOOLEAN DEFAULT TRUE,
        ticket_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_name (name),
        INDEX idx_is_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create support_tickets table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        subject VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        category_id INT NOT NULL,
        status ENUM('open', 'in_progress', 'resolved', 'closed') DEFAULT 'open',
        priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES support_categories(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_category_id (category_id),
        INDEX idx_status (status),
        INDEX idx_priority (priority),
        INDEX idx_created_at (created_at),
        FULLTEXT idx_subject_description (subject, description)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create support_messages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS support_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ticket_id INT NOT NULL,
        sender_id INT NOT NULL,
        content TEXT NOT NULL,
        attachments JSON,
        is_internal BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_ticket_id (ticket_id),
        INDEX idx_sender_id (sender_id),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create support_settings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS support_settings (
        id INT PRIMARY KEY DEFAULT 1,
        general_settings LONGTEXT NULL,
        ticket_settings LONGTEXT NULL,
        sla_settings LONGTEXT NULL,
        notification_settings LONGTEXT NULL,
        security_settings LONGTEXT NULL,
        advanced_settings LONGTEXT NULL,
        updated_by INT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_updated_at (updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Run schema migrations (idempotent - safe to run multiple times)
    try {
      await runSchemaMigrations();
    } catch (migrationError) {
      console.error('⚠️ Error running migrations:', migrationError.message);
      // Don't throw - let initialization continue even if migrations fail
    }
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    throw error;
  }
}

async function runSchemaMigrations() {
  try {
    // Check if developer_id column exists
    const [columns] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_NAME = 'projects' AND COLUMN_NAME = 'developer_id'`
    );

    const developerIdExists = columns && columns.length > 0;

    if (!developerIdExists) {
      // Add developer_id column
      await pool.query(
        `ALTER TABLE projects ADD COLUMN developer_id INT NULL AFTER client_id`
      );

      // Add foreign key constraint
      try {
        await pool.query(
          `ALTER TABLE projects ADD CONSTRAINT fk_projects_developer_id 
           FOREIGN KEY (developer_id) REFERENCES users(id) ON DELETE SET NULL`
        );
      } catch (fkError) {
        if (fkError.message.includes('already exists')) {
          // Foreign key already exists, continue
        } else {
          throw fkError;
        }
      }

      // Add index on developer_id
      try {
        await pool.query(
          `ALTER TABLE projects ADD INDEX idx_developer_id (developer_id)`
        );
      } catch (indexError) {
        if (indexError.message.includes('already exists')) {
          // Index already exists, continue
        } else {
          throw indexError;
        }
      }
    }

    // Ensure description column is nullable (always attempt)
    try {
      await pool.query(
        `ALTER TABLE projects MODIFY COLUMN description TEXT NULL`
      );
    } catch (descError) {
      // Some MySQL versions return different messages; continue if already nullable
    }

    // Create settings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id INT PRIMARY KEY DEFAULT 1,
        general_settings LONGTEXT NULL,
        security_settings LONGTEXT NULL,
        email_settings LONGTEXT NULL,
        payment_settings LONGTEXT NULL,
        notification_settings LONGTEXT NULL,
        updated_by INT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_updated_at (updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (error) {
    console.error('❌ Migration error:', error.message);
    throw error;
  }
}
