# Database Schema Mapping for Portfolio Setup Submission

## Overview
The frontend form submission in PortfolioSetup.tsx now sends data with schema-aware mapping and null value handling. This document outlines the expected database tables, columns, and data flow for proper storage.

## Phase-Based Submission Flow

### Phase 1: Build Schema-Aware Profile Data
Frontend builds a complete profileData object with:
- All personal info fields (name, bio, role, company_type, years_experience, etc.)
- All preference fields (project_types, preferred_cities, languages, budget_range, etc.)
- Null values for missing/unavailable fields
- Arrays converted to JSON strings for storage

**Target Table: `users` or `user_profiles`**

| Column | Source Field | Data Type | Handling |
|--------|--------------|-----------|----------|
| `name` | formData.personal.fullName | varchar | Trim, set null if empty |
| `bio` | formData.personal.bio | text | Trim, set null if empty |
| `role` | formData.personal.role | varchar | 'developer' or 'client' |
| `company_type` | formData.personal.companyType | varchar | Null if not applicable |
| `years_experience` | formData.personal.yearsExperience | int | Parse first number, null if missing |
| `preferred_cities` | citiesCovered or preferredCities | JSON/text | JSON stringify array |
| `languages` | formData.personal.languages | JSON/text | JSON stringify array |
| `project_types` | formData.preferences.projectTypes | JSON/text | JSON stringify array |
| `budget_range` | formData.preferences.budgetRange | varchar | null if empty |
| `working_style` | formData.preferences.workingStyle | varchar | null if empty |
| `availability` | formData.preferences.availability | varchar | null if empty |
| `specializations` | formData.preferences.specializations | JSON/text | Comma-separated or JSON |
| `setup_completed` | hardcoded | boolean/int | Set to 1/true |

### Phase 2: Store Documents with Proper Categorization
Documents are uploaded to `user_documents` table with categorization:

**Target Table: `user_documents` or `documents`**

| Category | Document Type | Source | Multiple |
|----------|---------------|--------|----------|
| **Identity** | 'identity' | ID, CAC, Selfie | Yes (up to 3) |
| **Licenses** | 'license' | credentials.licenses[] | Yes (multiple) |
| **Certifications** | 'certification' | credentials.certifications[] | Yes (multiple) |
| **Testimonials** | 'testimonial' | credentials.testimonials[] | Yes (multiple) |
| **Project Media** | 'project_media' | projects[].media[] | Yes (per project) |

**Expected Columns:**
```
user_documents:
  - id (PK)
  - user_id (FK to users)
  - document_type (identity, license, certification, testimonial, project_media)
  - file_path / file_name / file_url
  - uploaded_at (timestamp)
  - description (optional)
```

**Insertion Pattern:**
```
Documents are uploaded via apiClient.uploadDocument(userId, documentType, file)
Each file creates one row in user_documents table
Files NOT stored inline - stored in uploads/ directory with path in DB
```

### Phase 3: Create Portfolio Entry
Optional portfolio table for storing aggregated profile data.

**Target Table: `portfolios`**

```sql
CREATE TABLE portfolios (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  bio TEXT,
  specializations TEXT,
  preferred_cities TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

**Data Mapping:**
- `user_id`: from authenticated user
- `bio`: formData.personal.bio (trimmed)
- `specializations`: formData.preferences.specializations.join(', ')
- `preferred_cities`: formData.personal.citiesCovered.join(', ')

### Phase 4: Create Projects with Media
Projects stored separately for portfolio showcase.

**Target Table: `projects`**

```sql
CREATE TABLE projects (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(100),
  location VARCHAR(255),
  budget DECIMAL(12,2),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

**Data Mapping:**
```
For each project in formData.projects[]:
  - user_id: authenticated user ID
  - title: project.title (required, trimmed)
  - description: project.description (trimmed, or null)
  - type: project.type (or null)
  - location: project.location (trimmed, or null)
  - budget: project.budget (or null)
```

**Project Media Storage:**
- Media files uploaded as documents with type 'project_media'
- Or linked to projects table via project_id foreign key in user_documents
- Allows multiple media files per project

## Frontend Data Structure

### formData Object (from localStorage)
```typescript
formData = {
  personal: {
    fullName: string,
    bio: string,
    role: 'developer' | 'client',
    companyType: string,
    yearsExperience: string,
    citiesCovered: string[],
    languages: string[]
  },
  identity: {
    id?: { file: File, name: string, size: number },
    cac?: { file: File, name: string, size: number },
    selfie?: { file: File, name: string, size: number }
  },
  credentials: {
    licenses: File[],
    certifications: File[],
    testimonials: File[]
  },
  projects: Array<{
    id: string,
    title: string,
    type: string,
    location: string,
    budget: string,
    description: string,
    media: File[]
  }>,
  preferences: {
    projectTypes: string[],
    preferredCities: string[],
    budgetRange: string,
    workingStyle: string,
    availability: string,
    specializations: string[]
  }
}
```

## Null Value Handling

### Set to NULL if:
- Field is undefined, null, or empty string
- Array is empty (converted to null instead of empty string)
- Numeric field cannot be parsed

### Set to Empty String if:
- Optional field left blank by user (less common)

### Always Set (Never Null):
- `user_id` (required for all records)
- `setup_completed` (always 1/true on final submission)
- `created_at`, `updated_at` (DB defaults)

## Error Handling

### Partial Success Strategy
If any phase fails (document upload, project creation, etc.):
1. Continue to next phase (graceful degradation)
2. Log error details for admin review
3. Allow profile update to complete
4. User can re-attempt from dashboard

### Transaction Support (Recommended)
Implement transaction wrapping:
- Start transaction on profile update
- Commit only if all phases successful
- Rollback on critical failure

## API Endpoints Expected

### Frontend calls these endpoints:

1. **Upload Documents (Existing)**
   ```
   POST /api/documents/upload
   Params: userId, documentType, file
   ```

2. **Create Portfolio (May need to create)**
   ```
   POST /api/portfolio
   Body: { user_id, bio, specializations, preferred_cities }
   ```

3. **Create Project (Existing or modify)**
   ```
   POST /api/projects
   Body: { user_id, title, description, type, location, budget }
   ```

4. **Update Profile (Existing)**
   ```
   PUT /api/users/:id
   Body: { name, bio, role, company_type, ... all fields }
   ```

## Data Migration Path

If existing data needs consolidation:

1. Identify existing users with partial data
2. Scan user_documents for legacy uploads
3. Rebuild portfolios table from users table
4. Verify all required fields present before marking setup_completed

## Testing Checklist

- [ ] All profile fields properly mapped to users table
- [ ] Null values stored as NULL in database (not empty strings)
- [ ] Documents stored in user_documents with correct type categorization
- [ ] Projects created with all required fields
- [ ] Project media linked to projects (via user_documents or project_id)
- [ ] Portfolio entry created with aggregated data
- [ ] setup_completed flag set to 1 only on full success
- [ ] Partial failure doesn't prevent profile update
- [ ] localStorage keys cleared on successful submission
- [ ] User redirected to dashboard after completion

## Notes

- All timestamps handled by database defaults
- File storage uses uploads/ directory structure
- Database should allow NULL for optional fields
- Consider adding audit log for submission attempts
- Consider indexing user_id and document_type for fast queries
