import axios from 'axios';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_GROUP_CHAT_ID = process.env.TELEGRAM_GROUP_CHAT_ID;
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

interface TelegramNotificationData {
  userName: string;
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
 * Format message for Telegram (supports Markdown)
 */
function formatTelegramMessage(data: TelegramNotificationData): string {
  const changeTypeText = data.changeType === 'ADD' ? 'add' :
                        data.changeType === 'EDIT' ? 'edit' : 'delete';

  if (data.type === 'approved') {
    return `✅ *Change Approved!*

Hi *${data.userName}*,

Your request to *${changeTypeText}* an activity has been approved.

📋 *Activity:* ${data.activityDescription}
${data.activityTime ? `🕐 *Time:* ${data.activityTime}\n` : ''}📅 *Week:* Week ${data.weekNumber}
📆 *Day:* ${data.dayName}
👤 *Approved by:* ${data.approvedBy || 'Admin'}

View the updated schedule at your convenience.`;
  } else {
    return `❌ *Change Rejected*

Hi *${data.userName}*,

Your request to *${changeTypeText}* an activity has been rejected.

📋 *Activity:* ${data.activityDescription}
${data.activityTime ? `🕐 *Time:* ${data.activityTime}\n` : ''}📅 *Week:* Week ${data.weekNumber}
📆 *Day:* ${data.dayName}
👤 *Rejected by:* ${data.rejectedBy || 'Admin'}
${data.rejectionReason ? `\n💬 *Reason:* ${data.rejectionReason}` : ''}

Please review the feedback and submit a new request if needed.`;
  }
}

/**
 * Send message to Telegram group
 */
export async function sendTelegramNotification(data: TelegramNotificationData): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('⚠️ TELEGRAM_BOT_TOKEN not configured, skipping Telegram notification');
    return;
  }

  if (!TELEGRAM_GROUP_CHAT_ID) {
    console.warn('⚠️ TELEGRAM_GROUP_CHAT_ID not configured, skipping Telegram notification');
    return;
  }

  try {
    const message = formatTelegramMessage(data);

    const response = await axios.post(`${TELEGRAM_API_URL}/sendMessage`, {
      chat_id: TELEGRAM_GROUP_CHAT_ID,
      text: message,
      parse_mode: 'Markdown',
    });

    if (response.data.ok) {
      console.log('✅ Telegram notification sent successfully');
    } else {
      console.error('❌ Telegram API returned error:', response.data);
    }
  } catch (error: unknown) {
    console.error('❌ Failed to send Telegram notification:', error);
    if (axios.isAxiosError(error)) {
      console.error('Response data:', error.response?.data);
    }
    // Don't throw - notification failure shouldn't break the approval/rejection
  }
}

export default {
  sendTelegramNotification,
};
