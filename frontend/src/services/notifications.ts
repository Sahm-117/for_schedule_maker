import axios from 'axios';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

interface NotificationData {
  userName: string;
  userEmail: string;
  type: 'approved' | 'rejected' | 'pending';
  changeType: 'ADD' | 'EDIT' | 'DELETE';
  activityDescription: string;
  activityTime?: string;
  weekNumber: number;
  dayName: string;
  approvedBy?: string;
  rejectedBy?: string;
  rejectionReason?: string;
  submittedBy?: string;
}

/**
 * Send notifications via Supabase Edge Function
 * This calls our server-side function which handles email and Telegram
 */
export async function sendNotifications(data: NotificationData): Promise<void> {

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


    if (response.data.email === 'sent') {
    } else {
    }

    if (response.data.telegram === 'sent') {
    } else {
    }
  } catch (error) {
    console.error('❌ Failed to send notifications:', error);
    // Don't throw - notification failure shouldn't break the approval/rejection
  }
}

export default {
  sendNotifications,
};
