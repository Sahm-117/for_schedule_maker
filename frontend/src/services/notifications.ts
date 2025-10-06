import { Resend } from 'resend';
import axios from 'axios';

const RESEND_API_KEY = import.meta.env.VITE_RESEND_API_KEY;
const RESEND_FROM_EMAIL = import.meta.env.VITE_RESEND_FROM_EMAIL || 'noreply@fofscheduler.com';
const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin;
const TELEGRAM_BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
const TELEGRAM_GROUP_CHAT_ID = import.meta.env.VITE_TELEGRAM_GROUP_CHAT_ID;

interface NotificationData {
  userName: string;
  userEmail: string;
  type: 'approved' | 'rejected';
  changeType: 'ADD' | 'EDIT' | 'DELETE';
  activityDescription: string;
  activityTime?: string;
  weekNumber: number;
  dayName: string;
  approvedBy?: string;
  rejectedBy?: string;
  rejectionReason?: string;
}

/**
 * Send email notification using Resend
 */
async function sendEmailNotification(data: NotificationData): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn('⚠️ VITE_RESEND_API_KEY not configured, skipping email notification');
    return;
  }

  const resend = new Resend(RESEND_API_KEY);
  const changeTypeText = data.changeType === 'ADD' ? 'add' :
                        data.changeType === 'EDIT' ? 'edit' : 'delete';

  try {
    if (data.type === 'approved') {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Change Approved</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #10b981; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">✅ Change Approved!</h1>
          </div>

          <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="font-size: 16px; margin-top: 0;">
              Hi ${data.userName},
            </p>

            <p style="font-size: 16px;">
              Great news! Your request to <strong>${changeTypeText}</strong> an activity has been approved.
            </p>

            <div style="background: #f0f9ff; padding: 16px; border-radius: 8px; border-left: 4px solid #3b82f6; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; width: 140px;">Activity:</td>
                  <td style="padding: 8px 0;">${data.activityDescription}</td>
                </tr>
                ${data.activityTime ? `
                <tr>
                  <td style="padding: 8px 0; font-weight: bold;">Time:</td>
                  <td style="padding: 8px 0;">${data.activityTime}</td>
                </tr>
                ` : ''}
                <tr>
                  <td style="padding: 8px 0; font-weight: bold;">Week:</td>
                  <td style="padding: 8px 0;">Week ${data.weekNumber}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold;">Day:</td>
                  <td style="padding: 8px 0;">${data.dayName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold;">Approved by:</td>
                  <td style="padding: 8px 0;">${data.approvedBy || 'Admin'}</td>
                </tr>
              </table>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${APP_URL}"
                 style="background: #10b981; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                View Schedule
              </a>
            </div>

            <p style="font-size: 14px; color: #6b7280; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
              This is an automated notification from FOF Schedule Editor.
            </p>
          </div>
        </body>
        </html>
      `;

      await resend.emails.send({
        from: RESEND_FROM_EMAIL,
        to: data.userEmail,
        subject: `✅ Change Approved: ${data.activityDescription}`,
        html: html,
      });

      console.log('✅ Email notification sent to', data.userEmail);
    } else if (data.type === 'rejected') {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Change Rejected</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #ef4444; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">❌ Change Rejected</h1>
          </div>

          <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="font-size: 16px; margin-top: 0;">
              Hi ${data.userName},
            </p>

            <p style="font-size: 16px;">
              Your request to <strong>${changeTypeText}</strong> an activity has been rejected.
            </p>

            <div style="background: #fef2f2; padding: 16px; border-radius: 8px; border-left: 4px solid #ef4444; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; width: 140px;">Activity:</td>
                  <td style="padding: 8px 0;">${data.activityDescription}</td>
                </tr>
                ${data.activityTime ? `
                <tr>
                  <td style="padding: 8px 0; font-weight: bold;">Time:</td>
                  <td style="padding: 8px 0;">${data.activityTime}</td>
                </tr>
                ` : ''}
                <tr>
                  <td style="padding: 8px 0; font-weight: bold;">Week:</td>
                  <td style="padding: 8px 0;">Week ${data.weekNumber}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold;">Day:</td>
                  <td style="padding: 8px 0;">${data.dayName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold;">Rejected by:</td>
                  <td style="padding: 8px 0;">${data.rejectedBy || 'Admin'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold;">Reason:</td>
                  <td style="padding: 8px 0; color: #dc2626; font-weight: 500;">${data.rejectionReason || 'No reason provided'}</td>
                </tr>
              </table>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${APP_URL}/history"
                 style="background: #ef4444; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                View Rejection Details
              </a>
            </div>

            <p style="font-size: 14px; color: #6b7280; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
              This is an automated notification from FOF Schedule Editor.
            </p>
          </div>
        </body>
        </html>
      `;

      await resend.emails.send({
        from: RESEND_FROM_EMAIL,
        to: data.userEmail,
        subject: `❌ Change Rejected: ${data.activityDescription}`,
        html: html,
      });

      console.log('✅ Email notification sent to', data.userEmail);
    }
  } catch (error) {
    console.error('❌ Failed to send email notification:', error);
    // Don't throw - notification failure shouldn't break the approval/rejection
  }
}

/**
 * Send Telegram notification
 */
async function sendTelegramNotification(data: NotificationData): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_GROUP_CHAT_ID) {
    console.warn('⚠️ Telegram not configured, skipping Telegram notification');
    return;
  }

  const changeTypeText = data.changeType === 'ADD' ? 'add' :
                        data.changeType === 'EDIT' ? 'edit' : 'delete';

  let message = '';
  if (data.type === 'approved') {
    message = `✅ *Change Approved!*

Hi *${data.userName}*,

Your request to *${changeTypeText}* an activity has been approved.

📋 *Activity:* ${data.activityDescription}
${data.activityTime ? `🕐 *Time:* ${data.activityTime}\n` : ''}📅 *Week:* Week ${data.weekNumber}
📆 *Day:* ${data.dayName}
👤 *Approved by:* ${data.approvedBy || 'Admin'}

View the updated schedule at your convenience.`;
  } else {
    message = `❌ *Change Rejected*

Hi *${data.userName}*,

Your request to *${changeTypeText}* an activity has been rejected.

📋 *Activity:* ${data.activityDescription}
${data.activityTime ? `🕐 *Time:* ${data.activityTime}\n` : ''}📅 *Week:* Week ${data.weekNumber}
📆 *Day:* ${data.dayName}
👤 *Rejected by:* ${data.rejectedBy || 'Admin'}
${data.rejectionReason ? `\n💬 *Reason:* ${data.rejectionReason}` : ''}

Please review the feedback and submit a new request if needed.`;
  }

  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: TELEGRAM_GROUP_CHAT_ID,
        text: message,
        parse_mode: 'Markdown',
      }
    );

    if (response.data.ok) {
      console.log('✅ Telegram notification sent successfully');
    } else {
      console.error('❌ Telegram API returned error:', response.data);
    }
  } catch (error: unknown) {
    console.error('❌ Failed to send Telegram notification:', error);
    // Don't throw - notification failure shouldn't break the approval/rejection
  }
}

/**
 * Send both email and Telegram notifications
 */
export async function sendNotifications(data: NotificationData): Promise<void> {
  console.log(`📧 Sending ${data.type} notification to ${data.userName}...`);

  // Send both in parallel
  await Promise.allSettled([
    sendEmailNotification(data),
    sendTelegramNotification(data),
  ]);
}

export default {
  sendNotifications,
};
