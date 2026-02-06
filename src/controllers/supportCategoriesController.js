import pool from '../config/database.js';

// Get all categories
export async function getCategories(req, res) {
  try {
    const [categories] = await pool.query(
      `SELECT id, name, description, color, is_active, ticket_count, created_at, updated_at 
       FROM support_categories 
       ORDER BY name ASC`
    );

    res.json(categories || []);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories', details: error.message });
  }
}

// Get single category
export async function getCategory(req, res) {
  try {
    const { id } = req.params;

    const [categories] = await pool.query(
      `SELECT id, name, description, color, is_active, ticket_count, created_at, updated_at 
       FROM support_categories 
       WHERE id = ?`,
      [id]
    );

    if (!categories || categories.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json(categories[0]);
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(500).json({ error: 'Failed to fetch category', details: error.message });
  }
}

// Create new category
export async function createCategory(req, res) {
  try {
    const { name, description = '', color = '#3B82F6' } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    // Check if category already exists
    const [existing] = await pool.query(
      'SELECT id FROM support_categories WHERE name = ?',
      [name]
    );

    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'Category already exists' });
    }

    const [result] = await pool.query(
      `INSERT INTO support_categories (name, description, color, is_active, ticket_count) 
       VALUES (?, ?, ?, TRUE, 0)`,
      [name, description, color]
    );

    const categoryId = result.insertId;

    const [category] = await pool.query(
      `SELECT id, name, description, color, is_active, ticket_count, created_at, updated_at 
       FROM support_categories 
       WHERE id = ?`,
      [categoryId]
    );

    res.status(201).json({
      message: 'Category created successfully',
      category: category[0]
    });
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Failed to create category', details: error.message });
  }
}

// Update category
export async function updateCategory(req, res) {
  try {
    const { id } = req.params;
    const { name, description, color, is_active } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    // Check if another category with same name exists
    const [existing] = await pool.query(
      'SELECT id FROM support_categories WHERE name = ? AND id != ?',
      [name, id]
    );

    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'Category name already in use' });
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }

    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }

    if (color !== undefined) {
      updates.push('color = ?');
      params.push(color);
    }

    if (is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(is_active);
    }

    updates.push('updated_at = NOW()');
    params.push(id);

    await pool.query(
      `UPDATE support_categories SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const [category] = await pool.query(
      `SELECT id, name, description, color, is_active, ticket_count, created_at, updated_at 
       FROM support_categories 
       WHERE id = ?`,
      [id]
    );

    res.json({
      message: 'Category updated successfully',
      category: category[0]
    });
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Failed to update category', details: error.message });
  }
}

// Toggle category status
export async function toggleCategoryStatus(req, res) {
  try {
    const { id } = req.params;

    // Get current status
    const [categories] = await pool.query(
      'SELECT is_active FROM support_categories WHERE id = ?',
      [id]
    );

    if (!categories || categories.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const newStatus = !categories[0].is_active;

    await pool.query(
      `UPDATE support_categories SET is_active = ?, updated_at = NOW() WHERE id = ?`,
      [newStatus, id]
    );

    const [category] = await pool.query(
      `SELECT id, name, description, color, is_active, ticket_count, created_at, updated_at 
       FROM support_categories 
       WHERE id = ?`,
      [id]
    );

    res.json({
      message: 'Category status toggled successfully',
      category: category[0]
    });
  } catch (error) {
    console.error('Error toggling category status:', error);
    res.status(500).json({ error: 'Failed to toggle category status', details: error.message });
  }
}

// Delete category
export async function deleteCategory(req, res) {
  try {
    const { id } = req.params;

    // Check if category has associated tickets
    const [tickets] = await pool.query(
      'SELECT COUNT(*) as count FROM support_tickets WHERE category_id = ?',
      [id]
    );

    if (tickets[0].count > 0) {
      return res.status(400).json({
        error: `Cannot delete category with ${tickets[0].count} associated tickets`
      });
    }

    await pool.query('DELETE FROM support_categories WHERE id = ?', [id]);

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete category', details: error.message });
  }
}
