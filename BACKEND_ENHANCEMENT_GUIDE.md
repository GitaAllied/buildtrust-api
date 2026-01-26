# Backend Enhancement Guide: Portfolio Setup Submission

## Summary
The frontend form submission now sends schema-aware, null-handling data. This guide explains what backend modifications are needed to properly handle this new submission format.

## Current Backend Status
✅ **uploadDocument** - Supports types: 'license', 'certification', 'testimonial', 'identity'
✅ **createProject** - Requires title and description, accepts type, location, budget
⚠️ **updateProfile** - Needs enhancement to handle null values and setup_completed flag
❌ **Portfolio Creation** - Not implemented, should create portfolio table entries
❌ **Document Type Extension** - Needs 'project_media' document type support

## Required Modifications

### 1. Update uploadDocument to Accept 'project_media' Type
**File:** `src/controllers/userDocumentsController.js`

**Current:**
```javascript
const allowedTypes = ['license', 'certification', 'testimonial', 'identity'];
```

**Change to:**
```javascript
const allowedTypes = ['license', 'certification', 'testimonial', 'identity', 'project_media'];
```

**Rationale:** Allows project media files to be stored in user_documents table with proper categorization.

---

### 2. Update Projects Controller to Use 'user_id' Instead of 'client_id'
**File:** `src/controllers/projectsController.js`

For developers submitting portfolio projects, use 'user_id' not 'client_id':

**Change in createProject (lines ~17-18):**
```javascript
const { title, type, location, budget, description, client_id, user_id } = req.body;

// Use client_id (for client projects) OR user_id (for developer portfolios)
const projectUserId = user_id || client_id || userId;
```

**Change in database INSERT (line ~32):**
```javascript
// Add user_id column if it doesn't exist
`INSERT INTO projects (user_id, client_id, title, type, location, budget, description, status, created_at, updated_at) 
 VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
[projectUserId, client_id || null, title, type || null, location || null, budget || null, description, 'active']
```

**Database Schema Update:**
```sql
-- Add user_id column to projects table if it doesn't exist
ALTER TABLE projects ADD COLUMN user_id INT;
ALTER TABLE projects ADD FOREIGN KEY (user_id) REFERENCES users(id);

-- Make description optional (currently required)
ALTER TABLE projects MODIFY description TEXT NULL;
ALTER TABLE projects MODIFY type VARCHAR(100) NULL;
ALTER TABLE projects MODIFY location VARCHAR(255) NULL;
ALTER TABLE projects MODIFY budget DECIMAL(12,2) NULL;
```

---

### 3. Create Portfolio Table
**File:** `src/config/migrations.js` (or run directly)

**Create new table:**
```sql
CREATE TABLE portfolios (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL UNIQUE,
  bio TEXT NULL,
  specializations TEXT NULL,
  preferred_cities TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index for faster lookups
CREATE INDEX idx_portfolios_user_id ON portfolios(user_id);
```

---

### 4. Create Portfolio Controller & Routes
**File:** `src/controllers/portfoliosController.js` (NEW FILE)

```javascript
import pool from '../config/database.js';
import jwt from 'jsonwebtoken';

export const createPortfolio = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    const userId = decoded.userId || decoded.id;

    const { bio, specializations, preferred_cities } = req.body;

    // Check if portfolio already exists for this user
    const [existing] = await pool.query('SELECT id FROM portfolios WHERE user_id = ?', [userId]);
    
    if (existing && existing.length > 0) {
      // Update existing portfolio
      const [result] = await pool.query(
        `UPDATE portfolios 
         SET bio = ?, specializations = ?, preferred_cities = ?, updated_at = NOW()
         WHERE user_id = ?`,
        [bio || null, specializations || null, preferred_cities || null, userId]
      );
      
      return res.json({ 
        message: 'Portfolio updated successfully',
        id: existing[0].id
      });
    }

    // Create new portfolio
    const [result] = await pool.query(
      `INSERT INTO portfolios (user_id, bio, specializations, preferred_cities) 
       VALUES (?, ?, ?, ?)`,
      [userId, bio || null, specializations || null, preferred_cities || null]
    );

    res.status(201).json({ 
      message: 'Portfolio created successfully',
      id: result.insertId
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    res.status(500).json({ error: 'An error occurred while creating portfolio', details: error.message });
  }
};

export const getPortfolio = async (req, res) => {
  try {
    const { userId } = req.params;
    const [portfolios] = await pool.query(
      'SELECT id, user_id, bio, specializations, preferred_cities, created_at, updated_at FROM portfolios WHERE user_id = ?',
      [userId]
    );

    if (!portfolios || portfolios.length === 0) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    res.json(portfolios[0]);
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while retrieving portfolio' });
  }
};

export default { createPortfolio, getPortfolio };
```

**File:** `src/routes/portfolios.js` (NEW FILE)

```javascript
import express from 'express';
import { createPortfolio, getPortfolio } from '../controllers/portfoliosController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.post('/portfolios', authenticateToken, createPortfolio);
router.get('/portfolios/:userId', getPortfolio);

export default router;
```

**Add to `src/server.js`:**
```javascript
import portfolioRoutes from './routes/portfolios.js';
// ... in the app.use() section:
app.use('/api', portfolioRoutes);
```

---

### 5. Enhance updateProfile to Handle Null Values Properly
**File:** `src/controllers/authController.js` (lines 269-350)

**Current Issue:** The controller removes undefined values, but the frontend now explicitly sends null values for unavailable fields.

**Modification needed:**
```javascript
export const updateProfile = async (req, res) => {
  // ... existing code ...

  // Instead of removing undefined values, keep them for database NULL assignment
  const allowedFields = {
    name: req.body.name !== undefined ? req.body.name : null,
    bio: req.body.bio !== undefined ? req.body.bio : null,
    role: req.body.role !== undefined ? req.body.role : null,
    company_type: req.body.company_type !== undefined ? req.body.company_type : null,
    years_experience: req.body.years_experience !== undefined ? req.body.years_experience : null,
    project_types: Array.isArray(req.body.project_types) ? JSON.stringify(req.body.project_types) : 
                   (req.body.project_types !== undefined ? req.body.project_types : null),
    preferred_cities: Array.isArray(req.body.preferred_cities) ? JSON.stringify(req.body.preferred_cities) : 
                      (req.body.preferred_cities !== undefined ? req.body.preferred_cities : null),
    languages: Array.isArray(req.body.languages) ? JSON.stringify(req.body.languages) : 
               (req.body.languages !== undefined ? req.body.languages : null),
    budget_range: req.body.budget_range !== undefined ? req.body.budget_range : null,
    working_style: req.body.working_style !== undefined ? req.body.working_style : null,
    availability: req.body.availability !== undefined ? req.body.availability : null,
    specializations: Array.isArray(req.body.specializations) ? JSON.stringify(req.body.specializations) : 
                     (req.body.specializations !== undefined ? req.body.specializations : null),
    setup_completed: req.body.setup_completed === true ? 1 : 0,
  };

  // Build dynamic UPDATE query
  const updates = [];
  const values = [];
  
  Object.entries(allowedFields).forEach(([field, value]) => {
    updates.push(`${field} = ?`);
    values.push(value);
  });
  
  values.push(userId); // Add userId for WHERE clause
  
  const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
  await pool.query(sql, values);
  
  // Return updated user data
  const [updated] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
  res.json({ user: updated[0] });
};
```

---

### 6. Add Schema Endpoint (Optional but Recommended)
**File:** `src/controllers/schemaController.js` (NEW FILE)

This allows frontend to dynamically discover available columns:

```javascript
import pool from '../config/database.js';

export const getSchema = async (req, res) => {
  try {
    // Get column info for tables
    const tables = ['users', 'user_documents', 'projects'];
    const schema = {};

    for (const table of tables) {
      const [columns] = await pool.query(`DESCRIBE ${table}`);
      schema[table] = columns.map(col => ({
        field: col.Field,
        type: col.Type,
        nullable: col.Null === 'YES',
        key: col.Key,
        default: col.Default
      }));
    }

    res.json({ schema });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve schema' });
  }
};

export default { getSchema };
```

**Routes:** `src/routes/schema.js` (NEW FILE)
```javascript
import express from 'express';
import { getSchema } from '../controllers/schemaController.js';

const router = express.Router();
router.get('/schema', getSchema);
export default router;
```

---

## Frontend API Calls Expected

The frontend now calls these endpoints in order:

1. **Upload All Documents** (Multiple calls)
   ```
   POST /api/users/{userId}/documents
   Form data: file, type (identity|license|certification|testimonial|project_media)
   ```

2. **Create Projects** (Multiple calls)
   ```
   POST /api/projects
   JSON: { user_id, title, description, type, location, budget }
   ```

3. **Create Portfolio** (Optional)
   ```
   POST /api/portfolios
   JSON: { bio, specializations, preferred_cities }
   ```

4. **Update User Profile**
   ```
   PUT /api/auth/me
   JSON: { name, bio, role, company_type, years_experience, ... setup_completed: true }
   ```

## Implementation Checklist

- [ ] Add 'project_media' to allowed document types in userDocumentsController
- [ ] Update projects controller to accept and store user_id
- [ ] Create portfolios table in database
- [ ] Create portfoliosController.js with createPortfolio and getPortfolio
- [ ] Create portfolios route file
- [ ] Register portfolios routes in server.js
- [ ] Enhance updateProfile to handle null values properly
- [ ] Test full submission flow from frontend
- [ ] Verify data stored in correct tables
- [ ] Verify setup_completed flag set correctly
- [ ] Test partial failures (graceful degradation)

## Database Column Additions Required

```sql
-- Ensure projects table has these columns
ALTER TABLE projects MODIFY description TEXT NULL;
ALTER TABLE projects MODIFY type VARCHAR(100) NULL;
ALTER TABLE projects MODIFY location VARCHAR(255) NULL;
ALTER TABLE projects MODIFY budget DECIMAL(12,2) NULL;
ALTER TABLE projects ADD COLUMN user_id INT NULL;
ALTER TABLE projects ADD FOREIGN KEY (user_id) REFERENCES users(id);

-- Ensure users table allows NULL for most profile fields
ALTER TABLE users 
  MODIFY company_type VARCHAR(100) NULL,
  MODIFY years_experience INT NULL,
  MODIFY project_types JSON NULL,
  MODIFY preferred_cities JSON NULL,
  MODIFY budget_range VARCHAR(100) NULL,
  MODIFY working_style VARCHAR(100) NULL,
  MODIFY availability VARCHAR(100) NULL,
  MODIFY specializations JSON NULL,
  MODIFY languages JSON NULL;
```

## Testing Instructions

1. Complete frontend form with all fields filled
2. Submit form and monitor browser console for logs
3. Check backend logs for successful insertions
4. Verify user_documents table has all document types
5. Verify projects table has all projects created
6. Verify portfolios table has one entry per user
7. Verify users table setup_completed = 1
8. Complete frontend form with some empty fields (optional fields)
9. Verify NULL values stored correctly in database
10. Test with only required fields filled

## Error Handling Strategy

### If Document Upload Fails
- Log error but continue to next phase
- User can re-upload from dashboard later
- Profile still saved even if documents not fully uploaded

### If Project Creation Fails
- Log error but continue to profile update
- User can create projects manually from dashboard
- Portfolio still created with available data

### If Portfolio Creation Fails
- Non-critical operation
- Continue to profile update
- User can fill portfolio details from dashboard

### If Profile Update Fails
- Stop submission
- Return error to user
- Do NOT mark setup_completed
- User can retry from form

## Migration from Old System

If existing users have partial data:

1. Run initial portfolio creation for all users with setup_completed = 0
2. Scan user_documents and map to new document types
3. Scan projects and add user_id from client_id or manual mapping
4. Verify all required fields present before marking setup_completed = 1
5. Provide admin dashboard to fix incomplete setups
