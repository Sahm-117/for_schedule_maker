import axios from 'axios';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
 * Send notifications via Supabase Edge Function
 * This calls our server-side function which handles email and Telegram
 */
export async function sendNotifications(data: NotificationData): Promise<void> {
  console.log(`📧 Sending ${data.type} notification to ${data.userName}...`);
  console.log('📧 Notification data:', data);

  try {
    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/send-notification`,
      data,
      {
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ Notification response:', response.data);

    if (response.data.email === 'sent') {
      console.log('✅ Email notification sent successfully');
    } else {
      console.warn('⚠️ Email notification failed:', response.data.errors);
    }

    if (response.data.telegram === 'sent') {
      console.log('✅ Telegram notification sent successfully');
    } else {
      console.warn('⚠️ Telegram notification failed:', response.data.errors);
    }
  } catch (error) {
    console.error('❌ Failed to send notifications:', error);
    // Don't throw - notification failure shouldn't break the approval/rejection
  }
}

export default {
  sendNotifications,
};
