#!/usr/bin/env node
import pool from '../config/database.js';

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.log('Usage: node src/scripts/check_user_geo.js <userId|email>');
    process.exit(1);
  }

  const isId = /^\d+$/.test(arg);
  try {
    let userRows;
    if (isId) {
      [userRows] = await pool.query('SELECT id, email, ip_address, current_state, current_country, updated_at FROM users WHERE id = ?', [arg]);
    } else {
      [userRows] = await pool.query('SELECT id, email, ip_address, current_state, current_country, updated_at FROM users WHERE email = ?', [arg]);
    }

    if (!Array.isArray(userRows) || userRows.length === 0) {
      console.log('No user found for', arg);
      process.exit(2);
    }

    const user = userRows[0];
    console.log('User:', { id: user.id, email: user.email });
    console.log('ip_address:', user.ip_address || null);
    console.log('current_state:', user.current_state || null);
    console.log('current_country:', user.current_country || null);
    console.log('updated_at:', user.updated_at || null);

    // Also check recent form_submissions for this user (last 5)
    const [forms] = await pool.query(
      'SELECT id, route, method, ip_address, user_agent, created_at FROM form_submissions WHERE user_id = ? ORDER BY created_at DESC LIMIT 5',
      [user.id]
    );

    console.log('\nRecent form_submissions (last 5):');
    if (!forms || forms.length === 0) {
      console.log('  None found for this user');
    } else {
      for (const f of forms) {
        console.log(`  [${f.id}] ${f.route} ${f.method} ip=${f.ip_address} at=${f.created_at}`);
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('Error checking user geo:', err.message);
    process.exit(3);
  }
}

main();
