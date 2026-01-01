const nodemailer = require('nodemailer');

/**
 * Email Service using Nodemailer with SMTP
 * Handles all email communications for the application
 */
class EmailService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    this.fromEmail = process.env.EMAIL_FROM || 'noreply@bilenbilir.com';
    this.fromName = process.env.EMAIL_FROM_NAME || 'BilenBilir';
    this.appUrl = process.env.CLIENT_URL || 'http://localhost:3000';
  }

  /**
   * Initialize the email transporter
   * Should be called once at application startup
   */
  initialize() {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !port || !user || !pass) {
      console.warn('Email service not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS environment variables.');
      this.isConfigured = false;
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port: parseInt(port, 10),
      secure: parseInt(port, 10) === 465,
      auth: {
        user,
        pass
      }
    });

    this.isConfigured = true;
    console.log('Email service initialized successfully');
  }

  /**
   * Verify SMTP connection
   * @returns {Promise<boolean>}
   */
  async verifyConnection() {
    if (!this.isConfigured) {
      return false;
    }

    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('Email service connection failed:', error.message);
      return false;
    }
  }

  /**
   * Send an email with retry mechanism
   * @param {Object} options - Email options
   * @param {string} options.to - Recipient email
   * @param {string} options.subject - Email subject
   * @param {string} options.html - HTML content
   * @param {string} [options.text] - Plain text content (fallback)
   * @param {number} [options.maxRetries=3] - Maximum retry attempts
   * @returns {Promise<Object>} - Nodemailer response
   */
  async sendEmail({ to, subject, html, text, maxRetries = 3 }) {
    if (!this.isConfigured) {
      console.warn('Email service not configured. Email not sent to:', to);
      return { skipped: true, reason: 'Email service not configured' };
    }

    const mailOptions = {
      from: `"${this.fromName}" <${this.fromEmail}>`,
      to,
      subject,
      html,
      text: text || this._stripHtml(html)
    };

    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.transporter.sendMail(mailOptions);
        console.log('Email sent successfully to:', to);
        return result;
      } catch (error) {
        lastError = error;
        console.error(`Failed to send email to ${to} (attempt ${attempt}/${maxRetries}):`, error.message);

        // Don't retry on permanent failures (invalid address, etc.)
        if (this._isPermanentFailure(error)) {
          break;
        }

        // Wait before retry with exponential backoff
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await this._sleep(delay);
        }
      }
    }

    // All retries failed - return error result instead of throwing
    // This prevents email failures from breaking critical flows
    console.error(`Email to ${to} failed after ${maxRetries} attempts`);
    return {
      failed: true,
      error: lastError.message,
      to,
      subject
    };
  }

  /**
   * Check if error is a permanent failure that shouldn't be retried
   * @private
   */
  _isPermanentFailure(error) {
    const permanentCodes = [
      'EENVELOPE', // Invalid envelope
      'EAUTH',     // Authentication failed (config issue)
      550,         // Mailbox not found
      551,         // User not local
      552,         // Message too large
      553,         // Invalid mailbox name
      554          // Transaction failed
    ];
    return permanentCodes.includes(error.code) ||
           permanentCodes.includes(error.responseCode);
  }

  /**
   * Sleep helper for retry delays
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Send password reset email
   * @param {string} email - Recipient email
   * @param {string} resetToken - Plain reset token (not hashed)
   * @returns {Promise<Object>}
   */
  async sendPasswordReset(email, resetToken) {
    const resetUrl = `${this.appUrl}/reset-password?token=${resetToken}`;

    const html = this._getPasswordResetTemplate(resetUrl);

    return this.sendEmail({
      to: email,
      subject: 'Şifre Sıfırlama - BilenBilir',
      html
    });
  }

  /**
   * Send welcome email after registration
   * @param {string} email - Recipient email
   * @param {string} username - User's username
   * @returns {Promise<Object>}
   */
  async sendWelcome(email, username) {
    const html = this._getWelcomeTemplate(username);

    return this.sendEmail({
      to: email,
      subject: 'Hoş Geldiniz! - BilenBilir',
      html
    });
  }

  /**
   * Send password changed confirmation email
   * @param {string} email - Recipient email
   * @returns {Promise<Object>}
   */
  async sendPasswordChanged(email) {
    const html = this._getPasswordChangedTemplate();

    return this.sendEmail({
      to: email,
      subject: 'Şifreniz Değiştirildi - BilenBilir',
      html
    });
  }

  // ==================== Email Templates ====================

  /**
   * Base email template wrapper
   * @param {string} content - Inner HTML content
   * @returns {string}
   */
  _getBaseTemplate(content) {
    return `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BilenBilir</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 0;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">BilenBilir</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 14px;">
                Bu email ${this.fromName} tarafından gönderilmiştir.
              </p>
              <p style="margin: 10px 0 0 0; color: #9ca3af; font-size: 12px;">
                Bu emaili siz talep etmediyseniz, lütfen dikkate almayınız.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  /**
   * Password reset email template
   * @param {string} resetUrl - Password reset URL
   * @returns {string}
   */
  _getPasswordResetTemplate(resetUrl) {
    const content = `
      <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600;">Şifre Sıfırlama</h2>
      <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
        Hesabınız için şifre sıfırlama talebinde bulundunuz. Aşağıdaki butona tıklayarak yeni şifrenizi belirleyebilirsiniz.
      </p>
      <table role="presentation" style="margin: 30px 0;">
        <tr>
          <td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 6px;">
            <a href="${resetUrl}" style="display: inline-block; padding: 14px 30px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">
              Şifremi Sıfırla
            </a>
          </td>
        </tr>
      </table>
      <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">
        Veya aşağıdaki linki tarayıcınıza kopyalayın:
      </p>
      <p style="margin: 0 0 20px 0; color: #6366f1; font-size: 14px; word-break: break-all;">
        ${resetUrl}
      </p>
      <p style="margin: 0; color: #ef4444; font-size: 14px;">
        <strong>Not:</strong> Bu link 1 saat içinde geçerliliğini yitirecektir.
      </p>
    `;
    return this._getBaseTemplate(content);
  }

  /**
   * Welcome email template
   * @param {string} username - User's username
   * @returns {string}
   */
  _getWelcomeTemplate(username) {
    const content = `
      <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600;">Hoş Geldiniz, ${username}!</h2>
      <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
        BilenBilir ailesine katıldığınız için teşekkür ederiz! Artık kendi quizlerinizi oluşturabilir ve arkadaşlarınızla yarışabilirsiniz.
      </p>
      <h3 style="margin: 20px 0 15px 0; color: #1f2937; font-size: 18px;">Neler Yapabilirsiniz?</h3>
      <ul style="margin: 0 0 20px 0; padding-left: 20px; color: #4b5563; font-size: 16px; line-height: 1.8;">
        <li>Kendi quizlerinizi oluşturun</li>
        <li>Canlı quiz oyunları düzenleyin</li>
        <li>Arkadaşlarınızla gerçek zamanlı yarışın</li>
        <li>Skor tablolarında yerinizi alın</li>
      </ul>
      <table role="presentation" style="margin: 30px 0;">
        <tr>
          <td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 6px;">
            <a href="${this.appUrl}" style="display: inline-block; padding: 14px 30px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">
              Hemen Başla
            </a>
          </td>
        </tr>
      </table>
    `;
    return this._getBaseTemplate(content);
  }

  /**
   * Password changed confirmation template
   * @returns {string}
   */
  _getPasswordChangedTemplate() {
    const content = `
      <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600;">Şifreniz Değiştirildi</h2>
      <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
        Hesabınızın şifresi başarıyla değiştirildi. Bu işlemi siz yapmadıysanız, lütfen hemen bizimle iletişime geçin.
      </p>
      <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px 20px; margin: 20px 0; border-radius: 0 6px 6px 0;">
        <p style="margin: 0; color: #92400e; font-size: 14px;">
          <strong>Güvenlik Uyarısı:</strong> Eğer bu değişikliği siz yapmadıysanız, hesabınız tehlikede olabilir. Lütfen hemen şifrenizi değiştirin ve destek ekibimizle iletişime geçin.
        </p>
      </div>
    `;
    return this._getBaseTemplate(content);
  }

  /**
   * Strip HTML tags for plain text fallback
   * @param {string} html - HTML content
   * @returns {string}
   */
  _stripHtml(html) {
    return html
      .replace(/<style[^>]*>.*<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

// Singleton instance
const emailService = new EmailService();

module.exports = { EmailService, emailService };
