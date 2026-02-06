import pool from '../config/database.js';

const defaultSettings = {
  general_settings: {
    supportEmail: 'support@buildtrust.com',
    supportPhone: '+1 (555) 123-4567',
    businessHours: 'Mon-Fri 9AM-6PM EST',
    autoResponseEnabled: true,
    autoResponseMessage: 'Thank you for contacting BuildTrust support. We have received your message and will respond within 24 hours.'
  },
  ticket_settings: {
    autoAssignTickets: true,
    maxTicketsPerAgent: 10,
    ticketEscalationHours: 48,
    requireTicketApproval: false
  },
  sla_settings: {
    urgentResponseTime: 1,
    highResponseTime: 4,
    mediumResponseTime: 24,
    lowResponseTime: 72
  },
  notification_settings: {
    emailNotifications: true,
    smsNotifications: false,
    slackNotifications: true,
    webhookUrl: ''
  },
  security_settings: {
    requireAuthentication: true,
    allowFileUploads: true,
    maxFileSize: 10,
    allowedFileTypes: '.pdf,.doc,.docx,.jpg,.png'
  },
  advanced_settings: {
    enableChatbot: false,
    enableKnowledgeBase: true,
    enableTicketTemplates: true,
    enableAnalytics: true
  }
};

// Get all settings
export async function getSettings(req, res) {
  try {
    const [settings] = await pool.query(
      `SELECT id, general_settings, ticket_settings, sla_settings, notification_settings, security_settings, advanced_settings, updated_at 
       FROM support_settings 
       WHERE id = 1`
    );

    if (!settings || settings.length === 0) {
      // Initialize default settings
      await pool.query(
        `INSERT INTO support_settings (id, general_settings, ticket_settings, sla_settings, notification_settings, security_settings, advanced_settings) 
         VALUES (1, ?, ?, ?, ?, ?, ?)`,
        [
          JSON.stringify(defaultSettings.general_settings),
          JSON.stringify(defaultSettings.ticket_settings),
          JSON.stringify(defaultSettings.sla_settings),
          JSON.stringify(defaultSettings.notification_settings),
          JSON.stringify(defaultSettings.security_settings),
          JSON.stringify(defaultSettings.advanced_settings)
        ]
      );

      return res.json({
        id: 1,
        general_settings: defaultSettings.general_settings,
        ticket_settings: defaultSettings.ticket_settings,
        sla_settings: defaultSettings.sla_settings,
        notification_settings: defaultSettings.notification_settings,
        security_settings: defaultSettings.security_settings,
        advanced_settings: defaultSettings.advanced_settings
      });
    }

    const result = {
      id: settings[0].id,
      general_settings: settings[0].general_settings ? JSON.parse(settings[0].general_settings) : defaultSettings.general_settings,
      ticket_settings: settings[0].ticket_settings ? JSON.parse(settings[0].ticket_settings) : defaultSettings.ticket_settings,
      sla_settings: settings[0].sla_settings ? JSON.parse(settings[0].sla_settings) : defaultSettings.sla_settings,
      notification_settings: settings[0].notification_settings ? JSON.parse(settings[0].notification_settings) : defaultSettings.notification_settings,
      security_settings: settings[0].security_settings ? JSON.parse(settings[0].security_settings) : defaultSettings.security_settings,
      advanced_settings: settings[0].advanced_settings ? JSON.parse(settings[0].advanced_settings) : defaultSettings.advanced_settings,
      updated_at: settings[0].updated_at
    };

    res.json(result);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings', details: error.message });
  }
}

// Update general settings
export async function updateGeneralSettings(req, res) {
  try {
    const { supportEmail, supportPhone, businessHours, autoResponseEnabled, autoResponseMessage } = req.body;

    const settings = {
      supportEmail,
      supportPhone,
      businessHours,
      autoResponseEnabled,
      autoResponseMessage
    };

    await pool.query(
      `UPDATE support_settings SET general_settings = ?, updated_at = NOW() WHERE id = 1`,
      [JSON.stringify(settings)]
    );

    res.json({
      message: 'General settings updated successfully',
      settings
    });
  } catch (error) {
    console.error('Error updating general settings:', error);
    res.status(500).json({ error: 'Failed to update settings', details: error.message });
  }
}

// Update ticket settings
export async function updateTicketSettings(req, res) {
  try {
    const { autoAssignTickets, maxTicketsPerAgent, ticketEscalationHours, requireTicketApproval } = req.body;

    const settings = {
      autoAssignTickets,
      maxTicketsPerAgent,
      ticketEscalationHours,
      requireTicketApproval
    };

    await pool.query(
      `UPDATE support_settings SET ticket_settings = ?, updated_at = NOW() WHERE id = 1`,
      [JSON.stringify(settings)]
    );

    res.json({
      message: 'Ticket settings updated successfully',
      settings
    });
  } catch (error) {
    console.error('Error updating ticket settings:', error);
    res.status(500).json({ error: 'Failed to update settings', details: error.message });
  }
}

// Update SLA settings
export async function updateSLASettings(req, res) {
  try {
    const { urgentResponseTime, highResponseTime, mediumResponseTime, lowResponseTime } = req.body;

    const settings = {
      urgentResponseTime,
      highResponseTime,
      mediumResponseTime,
      lowResponseTime
    };

    await pool.query(
      `UPDATE support_settings SET sla_settings = ?, updated_at = NOW() WHERE id = 1`,
      [JSON.stringify(settings)]
    );

    res.json({
      message: 'SLA settings updated successfully',
      settings
    });
  } catch (error) {
    console.error('Error updating SLA settings:', error);
    res.status(500).json({ error: 'Failed to update settings', details: error.message });
  }
}

// Update notification settings
export async function updateNotificationSettings(req, res) {
  try {
    const { emailNotifications, smsNotifications, slackNotifications, webhookUrl } = req.body;

    const settings = {
      emailNotifications,
      smsNotifications,
      slackNotifications,
      webhookUrl
    };

    await pool.query(
      `UPDATE support_settings SET notification_settings = ?, updated_at = NOW() WHERE id = 1`,
      [JSON.stringify(settings)]
    );

    res.json({
      message: 'Notification settings updated successfully',
      settings
    });
  } catch (error) {
    console.error('Error updating notification settings:', error);
    res.status(500).json({ error: 'Failed to update settings', details: error.message });
  }
}

// Update security settings
export async function updateSecuritySettings(req, res) {
  try {
    const { requireAuthentication, allowFileUploads, maxFileSize, allowedFileTypes } = req.body;

    const settings = {
      requireAuthentication,
      allowFileUploads,
      maxFileSize,
      allowedFileTypes
    };

    await pool.query(
      `UPDATE support_settings SET security_settings = ?, updated_at = NOW() WHERE id = 1`,
      [JSON.stringify(settings)]
    );

    res.json({
      message: 'Security settings updated successfully',
      settings
    });
  } catch (error) {
    console.error('Error updating security settings:', error);
    res.status(500).json({ error: 'Failed to update settings', details: error.message });
  }
}

// Update advanced settings
export async function updateAdvancedSettings(req, res) {
  try {
    const { enableChatbot, enableKnowledgeBase, enableTicketTemplates, enableAnalytics } = req.body;

    const settings = {
      enableChatbot,
      enableKnowledgeBase,
      enableTicketTemplates,
      enableAnalytics
    };

    await pool.query(
      `UPDATE support_settings SET advanced_settings = ?, updated_at = NOW() WHERE id = 1`,
      [JSON.stringify(settings)]
    );

    res.json({
      message: 'Advanced settings updated successfully',
      settings
    });
  } catch (error) {
    console.error('Error updating advanced settings:', error);
    res.status(500).json({ error: 'Failed to update settings', details: error.message });
  }
}
