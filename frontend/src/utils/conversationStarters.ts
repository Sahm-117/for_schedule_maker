// Ready-made ways for a support to start a conversation in their group. A support types "/" in the group
// message box, picks one, and it is put into their message to edit or send. Plain wording, one idea each.

export interface ConversationStarter {
  id: string;
  /** Short name shown in the menu, and what typing after "/" matches. */
  label: string;
  /** What goes into the message. */
  text: string;
}

export const CONVERSATION_STARTERS: ConversationStarter[] = [
  { id: 'checkin', label: 'Check-in', text: 'Good day, everyone. How are you doing today? Tell us one thing you are grateful for.' },
  { id: 'week', label: 'How was your week', text: 'On a scale of 1 to 10, how was your week? Tell us why, and how we can celebrate or pray with you.' },
  { id: 'god-did', label: 'What God did', text: 'What is one thing God has done for you this week? Share it so we can rejoice with you.' },
  { id: 'prayer', label: 'Prayer request', text: 'What can we pray about with you this week? Drop your request here and the group will stand with you.' },
  { id: 'answered', label: 'Answered prayer', text: 'Share one answered prayer, big or small. Let us encourage one another with what God has done.' },
  { id: 'class', label: 'Last class', text: 'What stood out to you most in the last class? Share one thing you will apply this week.' },
  { id: 'hard', label: 'Hard to understand', text: 'Was any part of the last class hard to understand? Ask here, no question is too small, and we will go through it together.' },
  { id: 'faith-project', label: 'Faith project', text: 'How is your Faith Project going? Share where you are, and where you would like help.' },
  { id: 'verse', label: 'Favourite verse', text: 'Share a Bible verse that has been encouraging you lately and tell us why.' },
  { id: 'worship', label: 'Worship song', text: 'What song has been ministering to you lately? Share it and tell us why.' },
  { id: 'next-step', label: 'Next step', text: 'What is one small step you will take this week to grow in your faith?' },
  { id: 'encourage', label: 'Encourage someone', text: 'Send a word of encouragement to someone in this group today. Tag them with @.' },
  { id: 'sunday', label: 'Sunday', text: 'Who is coming this Sunday? Reply here so I know you are on your way.' },
  { id: 'looking-forward', label: 'Looking forward', text: 'What are you looking forward to this week?' },
];

/** The message for today's inspirational scripture: the image link (shown as the picture in the post) and a question. */
export const scriptureStarterText = (imageUrl: string): string =>
  `Today's inspirational scripture:\n${imageUrl}\n\nWhat stood out to you in it? Share one thing you take from it.`;
