import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@fofscheduler.com';
const APP_URL = process.env.APP_URL || 'http://localhost:5173';

interface NotificationData {
  userId: string;
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
  timestamp: Date;
}

/**
 * Send email notification for approved change
 */
async function sendApprovedEmail(data: NotificationData) {
  const changeTypeText = data.changeType === 'ADD' ? 'add' :
                        data.changeType === 'EDIT' ? 'edit' : 'delete';

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
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Time:</td>
              <td style="padding: 8px 0;">${data.timestamp.toLocaleString()}</td>
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

  try {
    const response = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.userEmail,
      subject: `✅ Change Approved: ${data.activityDescription}`,
      html: html,
    });

    console.log('✅ Approved email sent:', response);
    return response;
  } catch (error) {
    console.error('❌ Failed to send approved email:', error);
    throw error;
  }
}

/**
 * Send email notification for rejected change
 */
async function sendRejectedEmail(data: NotificationData) {
  const changeTypeText = data.changeType === 'ADD' ? 'add' :
                        data.changeType === 'EDIT' ? 'edit' : 'delete';

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
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Time:</td>
              <td style="padding: 8px 0;">${data.timestamp.toLocaleString()}</td>
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

  try {
    const response = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.userEmail,
      subject: `❌ Change Rejected: ${data.activityDescription}`,
      html: html,
    });

    console.log('✅ Rejected email sent:', response);
    return response;
  } catch (error) {
    console.error('❌ Failed to send rejected email:', error);
    throw error;
  }
}

/**
 * Main notification function - sends appropriate email based on type
 */
export async function sendNotification(data: NotificationData) {
  console.log(`📧 Sending ${data.type} notification to ${data.userEmail}...`);

  if (data.type === 'approved') {
    return await sendApprovedEmail(data);
  } else if (data.type === 'rejected') {
    return await sendRejectedEmail(data);
  } else {
    throw new Error(`Unknown notification type: ${data.type}`);
  }
}

export default {
  sendNotification,
  sendApprovedEmail,
  sendRejectedEmail,
};
