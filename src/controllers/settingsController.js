import pool from '../config/database.js';
import bcrypt from 'bcryptjs';

export const getSettings = async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT * FROM settings WHERE id = 1`);
    
    if (rows.length === 0) {
      // Return default settings if none exist
      return res.json(getDefaultSettings());
    }

    const settings = rows[0];
    // Parse JSON fields
    if (settings.general_settings) settings.general = JSON.parse(settings.general_settings);
    if (settings.security_settings) settings.security = JSON.parse(settings.security_settings);
    if (settings.email_settings) settings.email = JSON.parse(settings.email_settings);
    if (settings.payment_settings) settings.payment = JSON.parse(settings.payment_settings);
    if (settings.notification_settings) settings.notifications = JSON.parse(settings.notification_settings);

    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
};

export const updateGeneralSettings = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { general } = req.body;
    
    // Check if settings exist
    const [existing] = await pool.query(`SELECT id FROM settings WHERE id = 1`);
    
    if (existing.length === 0) {
      // Create new settings record
      await pool.query(`
        INSERT INTO settings (id, general_settings, updated_by, updated_at)
        VALUES (1, ?, ?, NOW())
      `, [JSON.stringify(general), userId]);
    } else {
      // Update existing
      await pool.query(`
        UPDATE settings SET general_settings = ?, updated_by = ?, updated_at = NOW() WHERE id = 1
      `, [JSON.stringify(general), userId]);
    }

    res.json({ success: true, message: 'General settings updated' });
  } catch (error) {
    console.error('Error updating general settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
};

export const updateSecuritySettings = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { security } = req.body;
    
    const [existing] = await pool.query(`SELECT id FROM settings WHERE id = 1`);
    
    if (existing.length === 0) {
      await pool.query(`
        INSERT INTO settings (id, security_settings, updated_by, updated_at)
        VALUES (1, ?, ?, NOW())
      `, [JSON.stringify(security), userId]);
    } else {
      await pool.query(`
        UPDATE settings SET security_settings = ?, updated_by = ?, updated_at = NOW() WHERE id = 1
      `, [JSON.stringify(security), userId]);
    }

    res.json({ success: true, message: 'Security settings updated' });
  } catch (error) {
    console.error('Error updating security settings:', error);
    res.status(500).json({ error: 'Failed to update security settings' });
  }
};

export const updateEmailSettings = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { email } = req.body;
    
    const [existing] = await pool.query(`SELECT id FROM settings WHERE id = 1`);
    
    if (existing.length === 0) {
      await pool.query(`
        INSERT INTO settings (id, email_settings, updated_by, updated_at)
        VALUES (1, ?, ?, NOW())
      `, [JSON.stringify(email), userId]);
    } else {
      await pool.query(`
        UPDATE settings SET email_settings = ?, updated_by = ?, updated_at = NOW() WHERE id = 1
      `, [JSON.stringify(email), userId]);
    }

    res.json({ success: true, message: 'Email settings updated' });
  } catch (error) {
    console.error('Error updating email settings:', error);
    res.status(500).json({ error: 'Failed to update email settings' });
  }
};

export const updatePaymentSettings = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { payment } = req.body;
    
    const [existing] = await pool.query(`SELECT id FROM settings WHERE id = 1`);
    
    if (existing.length === 0) {
      await pool.query(`
        INSERT INTO settings (id, payment_settings, updated_by, updated_at)
        VALUES (1, ?, ?, NOW())
      `, [JSON.stringify(payment), userId]);
    } else {
      await pool.query(`
        UPDATE settings SET payment_settings = ?, updated_by = ?, updated_at = NOW() WHERE id = 1
      `, [JSON.stringify(payment), userId]);
    }

    res.json({ success: true, message: 'Payment settings updated' });
  } catch (error) {
    console.error('Error updating payment settings:', error);
    res.status(500).json({ error: 'Failed to update payment settings' });
  }
};

export const updateNotificationSettings = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { notifications } = req.body;
    
    const [existing] = await pool.query(`SELECT id FROM settings WHERE id = 1`);
    
    if (existing.length === 0) {
      await pool.query(`
        INSERT INTO settings (id, notification_settings, updated_by, updated_at)
        VALUES (1, ?, ?, NOW())
      `, [JSON.stringify(notifications), userId]);
    } else {
      await pool.query(`
        UPDATE settings SET notification_settings = ?, updated_by = ?, updated_at = NOW() WHERE id = 1
      `, [JSON.stringify(notifications), userId]);
    }

    res.json({ success: true, message: 'Notification settings updated' });
  } catch (error) {
    console.error('Error updating notification settings:', error);
    res.status(500).json({ error: 'Failed to update notification settings' });
  }
};

export const updatePassword = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Verify current password
    const [users] = await pool.query(`SELECT password FROM users WHERE id = ?`, [userId]);
    
    if (!users.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password using bcrypt
    const user = users[0];
    const passwordMatch = await bcrypt.compare(currentPassword, user.password);
    
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password in database
    await pool.query(`UPDATE users SET password = ? WHERE id = ?`, [hashedPassword, userId]);

    console.log('Password updated successfully for user:', userId);
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({ error: 'Failed to update password' });
  }
};

function getDefaultSettings() {
  return {
    id: 1,
    general: {
      siteName: 'BuildTrust Africa',
      siteDescription: 'Connecting verified developers with clients across Africa',
      contactEmail: 'admin@buildtrust.africa',
      supportEmail: 'support@buildtrust.africa',
      companyAddress: 'Lagos, Nigeria',
      phoneNumber: '+234 xxx xxx xxxx',
      timezone: 'Africa/Lagos',
      language: 'en',
      dateFormat: 'DD/MM/YYYY',
      currency: 'NGN',
      registrationEnabled: true,
      emailVerificationRequired: true,
      maxProjectsPerUser: 10,
      maxFileSize: 50,
      sessionTimeout: 30,
    },
    security: {
      passwordMinLength: 8,
      passwordRequireUppercase: true,
      passwordRequireLowercase: true,
      passwordRequireNumbers: true,
      passwordRequireSpecialChars: false,
      maxLoginAttempts: 5,
      lockoutDuration: 30,
      twoFactorRequired: false,
      sessionTimeout: 30,
      ipWhitelistEnabled: false,
      ipWhitelist: '',
      bruteForceProtection: true,
      rateLimitingEnabled: true,
      apiRateLimit: 100,
      encryptionMethod: 'AES256',
      backupEncryption: true,
      auditLogging: true,
      suspiciousActivityAlerts: true,
    },
    email: {
      smtpHost: 'smtp.gmail.com',
      smtpPort: 587,
      smtpUsername: '',
      smtpPassword: '',
      smtpEncryption: 'tls',
      fromEmail: 'noreply@buildtrust.africa',
      fromName: 'BuildTrust Africa',
      replyToEmail: 'support@buildtrust.africa',
      emailVerificationEnabled: true,
      welcomeEmailEnabled: true,
      passwordResetEnabled: true,
      projectNotificationsEnabled: true,
      paymentNotificationsEnabled: true,
      adminNotificationsEnabled: true,
      emailQueueEnabled: true,
      maxEmailsPerHour: 1000,
      bounceHandlingEnabled: true,
    },
    payment: {
      primaryGateway: 'flutterwave',
      flutterwavePublicKey: '',
      flutterwaveSecretKey: '',
      flutterwaveEncryptionKey: '',
      paypalClientId: '',
      paypalClientSecret: '',
      stripePublishableKey: '',
      stripeSecretKey: '',
      escrowEnabled: true,
      escrowPercentage: 10,
      platformFee: 5,
      minimumProjectAmount: 1000,
      maximumProjectAmount: 1000000,
      currency: 'NGN',
      autoReleaseEscrow: false,
      escrowReleaseDays: 7,
      disputeResolutionEnabled: true,
      refundPolicyEnabled: true,
      paymentRetries: 3,
      webhookSecret: '',
    },
    notifications: {
      emailNotifications: true,
      smsNotifications: false,
      pushNotifications: true,
      newUserRegistration: true,
      projectCreated: true,
      paymentReceived: true,
      projectCompleted: true,
      disputeRaised: true,
      adminAlerts: true,
      weeklyReports: true,
      monthlyReports: true,
      systemAlerts: true,
      securityAlerts: true,
      smtpHost: 'smtp.gmail.com',
      smtpPort: 587,
      twilioSid: '',
      twilioToken: '',
      fcmServerKey: '',
    },
  };
}

export default {
  getSettings,
  updateGeneralSettings,
  updateSecuritySettings,
  updateEmailSettings,
  updatePaymentSettings,
  updateNotificationSettings,
  updatePassword,
};
