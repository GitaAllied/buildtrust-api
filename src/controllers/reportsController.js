import pool from '../config/database.js';

export const getReportTypes = async (req, res) => {
  try {
    const reportTypes = [
      {
        id: 'financial',
        title: 'Financial Report',
        description: 'Revenue, payments, and financial metrics',
        icon: 'DollarSign',
      },
      {
        id: 'user',
        title: 'User Activity Report',
        description: 'User registrations, engagement, and demographics',
        icon: 'Users',
      },
      {
        id: 'project',
        title: 'Project Performance Report',
        description: 'Project completion rates, timelines, and quality metrics',
        icon: 'TrendingUp',
      },
    ];
    res.json(reportTypes);
  } catch (error) {
    console.error('Error fetching report types:', error);
    res.status(500).json({ error: 'Failed to fetch report types' });
  }
};

export const generateFinancialReport = async (req, res) => {
  try {
    const { period } = req.body || {};
    const periodValue = period || 'monthly';

    // Get financial data from database
    const [projects] = await pool.query(`
      SELECT 
        COUNT(*) as total_projects,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_projects,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_projects,
        SUM(budget) as total_budget
      FROM projects
      WHERE DATE(created_at) >= DATE_SUB(NOW(), INTERVAL 1 ${periodValue === 'yearly' ? 'YEAR' : periodValue === 'quarterly' ? 'QUARTER' : periodValue === 'weekly' ? 'WEEK' : 'MONTH'})
    `);

    const [contracts] = await pool.query(`
      SELECT 
        COUNT(*) as total_contracts,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_contracts,
        SUM(contract_value) as total_contract_value
      FROM contracts
      WHERE DATE(created_at) >= DATE_SUB(NOW(), INTERVAL 1 ${periodValue === 'yearly' ? 'YEAR' : periodValue === 'quarterly' ? 'QUARTER' : periodValue === 'weekly' ? 'WEEK' : 'MONTH'})
    `);

    const reportData = {
      ...projects[0],
      ...contracts[0],
      period: periodValue,
      generated_at: new Date().toISOString(),
    };

    res.json({
      id: Date.now(),
      name: `Financial Report - ${periodValue.charAt(0).toUpperCase() + periodValue.slice(1)} ${new Date().toLocaleDateString()}`,
      type: 'Financial',
      generated: new Date().toLocaleString(),
      size: `${(2 + Math.random() * 2).toFixed(1)} MB`,
      data: reportData,
    });
  } catch (error) {
    console.error('Error generating financial report:', error);
    res.status(500).json({ error: 'Failed to generate financial report' });
  }
};

export const generateUserReport = async (req, res) => {
  try {
    const { period } = req.body || {};
    const periodValue = period || 'monthly';

    // Get user data from database
    const [userStats] = await pool.query(`
      SELECT 
        COUNT(*) as total_users,
        SUM(CASE WHEN role = 'client' THEN 1 ELSE 0 END) as total_clients,
        SUM(CASE WHEN role = 'developer' THEN 1 ELSE 0 END) as total_developers,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as total_admins,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_users,
        SUM(CASE WHEN setup_completed = 1 THEN 1 ELSE 0 END) as setup_completed_users
      FROM users
      WHERE DATE(created_at) >= DATE_SUB(NOW(), INTERVAL 1 ${periodValue === 'yearly' ? 'YEAR' : periodValue === 'quarterly' ? 'QUARTER' : periodValue === 'weekly' ? 'WEEK' : 'MONTH'})
    `);

    const [newRegistrations] = await pool.query(`
      SELECT COUNT(*) as new_registrations
      FROM users
      WHERE DATE(created_at) = CURDATE()
    `);

    const reportData = {
      ...userStats[0],
      ...newRegistrations[0],
      period: periodValue,
      generated_at: new Date().toISOString(),
    };

    res.json({
      id: Date.now(),
      name: `User Activity Report - ${periodValue.charAt(0).toUpperCase() + periodValue.slice(1)} ${new Date().toLocaleDateString()}`,
      type: 'User',
      generated: new Date().toLocaleString(),
      size: `${(1.5 + Math.random() * 2).toFixed(1)} MB`,
      data: reportData,
    });
  } catch (error) {
    console.error('Error generating user report:', error);
    res.status(500).json({ error: 'Failed to generate user report' });
  }
};

export const generateProjectReport = async (req, res) => {
  try {
    const { period } = req.body || {};
    const periodValue = period || 'monthly';

    // Get project data from database
    const [projectStats] = await pool.query(`
      SELECT 
        COUNT(*) as total_projects,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_projects,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_projects,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_projects,
        AVG(CASE WHEN status = 'completed' THEN rating END) as average_rating,
        SUM(budget) as total_budget
      FROM projects
      WHERE DATE(created_at) >= DATE_SUB(NOW(), INTERVAL 1 ${periodValue === 'yearly' ? 'YEAR' : periodValue === 'quarterly' ? 'QUARTER' : periodValue === 'weekly' ? 'WEEK' : 'MONTH'})
    `);

    const reportData = {
      ...projectStats[0],
      period: periodValue,
      generated_at: new Date().toISOString(),
    };

    res.json({
      id: Date.now(),
      name: `Project Performance Report - ${periodValue.charAt(0).toUpperCase() + periodValue.slice(1)} ${new Date().toLocaleDateString()}`,
      type: 'Project',
      generated: new Date().toLocaleString(),
      size: `${(2.5 + Math.random() * 2).toFixed(1)} MB`,
      data: reportData,
    });
  } catch (error) {
    console.error('Error generating project report:', error);
    res.status(500).json({ error: 'Failed to generate project report' });
  }
};

export const getRecentReports = async (req, res) => {
  try {
    // This would typically fetch from a reports table if you store generated reports
    // For now, return empty array as reports are generated on-demand
    res.json([]);
  } catch (error) {
    console.error('Error fetching recent reports:', error);
    res.status(500).json({ error: 'Failed to fetch recent reports' });
  }
};

export const downloadReport = async (req, res) => {
  try {
    const { reportId, type } = req.params;

    let csv = '';
    const typeNormalized = type.toLowerCase();

    if (typeNormalized === 'financial') {
      // Get fresh financial data
      const [projects] = await pool.query(`
        SELECT 
          COUNT(*) as total_projects,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_projects,
          SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_projects,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_projects,
          SUM(budget) as total_budget
        FROM projects
      `);

      const [contracts] = await pool.query(`
        SELECT 
          COUNT(*) as total_contracts,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_contracts,
          SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_contracts,
          SUM(contract_value) as total_contract_value
        FROM contracts
      `);

      const projectData = projects[0] || {};
      const contractData = contracts[0] || {};

      csv = 'Financial Report\n';
      csv += 'Generated: ' + new Date().toISOString() + '\n\n';
      csv += 'Projects Summary\n';
      csv += 'Total Projects,Completed,In Progress,Pending,Total Budget\n';
      csv += `${projectData.total_projects || 0},${projectData.completed_projects || 0},${projectData.in_progress_projects || 0},${projectData.pending_projects || 0},${projectData.total_budget || 0}\n\n`;
      csv += 'Contracts Summary\n';
      csv += 'Total Contracts,Completed,In Progress,Total Value\n';
      csv += `${contractData.total_contracts || 0},${contractData.completed_contracts || 0},${contractData.in_progress_contracts || 0},${contractData.total_contract_value || 0}\n`;

    } else if (typeNormalized === 'user') {
      // Get fresh user data
      const [userStats] = await pool.query(`
        SELECT 
          COUNT(*) as total_users,
          SUM(CASE WHEN role = 'client' THEN 1 ELSE 0 END) as total_clients,
          SUM(CASE WHEN role = 'developer' THEN 1 ELSE 0 END) as total_developers,
          SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as total_admins,
          SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_users,
          SUM(CASE WHEN setup_completed = 1 THEN 1 ELSE 0 END) as setup_completed_users,
          SUM(CASE WHEN email_verified = 1 THEN 1 ELSE 0 END) as verified_users
        FROM users
      `);

      const [newRegistrations] = await pool.query(`
        SELECT COUNT(*) as new_registrations_today
        FROM users
        WHERE DATE(created_at) = CURDATE()
      `);

      const [roleBreakdown] = await pool.query(`
        SELECT role, COUNT(*) as count
        FROM users
        GROUP BY role
      `);

      const stats = userStats[0] || {};
      const registrations = newRegistrations[0] || {};

      csv = 'User Activity Report\n';
      csv += 'Generated: ' + new Date().toISOString() + '\n\n';
      csv += 'Overall User Statistics\n';
      csv += 'Total Users,Clients,Developers,Admins,Active,Setup Completed,Verified\n';
      csv += `${stats.total_users || 0},${stats.total_clients || 0},${stats.total_developers || 0},${stats.total_admins || 0},${stats.active_users || 0},${stats.setup_completed_users || 0},${stats.verified_users || 0}\n\n`;
      csv += 'Today\'s Registrations: ' + (registrations.new_registrations_today || 0) + '\n\n';
      csv += 'Role Breakdown\n';
      csv += 'Role,Count\n';
      if (Array.isArray(roleBreakdown)) {
        roleBreakdown.forEach((row) => {
          csv += `${row.role},${row.count}\n`;
        });
      }

    } else if (typeNormalized === 'project') {
      // Get fresh project data
      const [projectStats] = await pool.query(`
        SELECT 
          COUNT(*) as total_projects,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_projects,
          SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_projects,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_projects,
          ROUND(AVG(CASE WHEN status = 'completed' THEN rating END), 2) as average_rating,
          SUM(budget) as total_budget,
          ROUND(AVG(budget), 2) as average_budget
        FROM projects
      `);

      const [statusBreakdown] = await pool.query(`
        SELECT status, COUNT(*) as count
        FROM projects
        GROUP BY status
      `);

      const [ratingDistribution] = await pool.query(`
        SELECT 
          CASE 
            WHEN rating >= 4.5 THEN '5 Stars'
            WHEN rating >= 3.5 THEN '4 Stars'
            WHEN rating >= 2.5 THEN '3 Stars'
            WHEN rating >= 1.5 THEN '2 Stars'
            ELSE '1 Star'
          END as rating_range,
          COUNT(*) as count
        FROM projects
        WHERE rating IS NOT NULL
        GROUP BY rating_range
        ORDER BY rating_range DESC
      `);

      const pStats = projectStats[0] || {};

      csv = 'Project Performance Report\n';
      csv += 'Generated: ' + new Date().toISOString() + '\n\n';
      csv += 'Overall Project Statistics\n';
      csv += 'Total Projects,Completed,In Progress,Pending,Avg Rating,Total Budget,Avg Budget\n';
      csv += `${pStats.total_projects || 0},${pStats.completed_projects || 0},${pStats.in_progress_projects || 0},${pStats.pending_projects || 0},${pStats.average_rating || 0},${pStats.total_budget || 0},${pStats.average_budget || 0}\n\n`;
      csv += 'Status Breakdown\n';
      csv += 'Status,Count\n';
      if (Array.isArray(statusBreakdown)) {
        statusBreakdown.forEach((row) => {
          csv += `${row.status},${row.count}\n`;
        });
      }
      csv += '\nRating Distribution\n';
      csv += 'Rating Range,Count\n';
      if (Array.isArray(ratingDistribution)) {
        ratingDistribution.forEach((row) => {
          csv += `${row.rating_range},${row.count}\n`;
        });
      }
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="report_${reportId}_${typeNormalized}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Error downloading report:', error);
    res.status(500).json({ error: 'Failed to download report' });
  }
};

export default {
  getReportTypes,
  generateFinancialReport,
  generateUserReport,
  generateProjectReport,
  getRecentReports,
  downloadReport,
};
