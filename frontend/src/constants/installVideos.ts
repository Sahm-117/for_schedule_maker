// The two short videos that show how to put the app on the Home Screen and turn
// notifications on, one for each kind of phone. Shared by the login messages
// supports send, the "no alerts" reminder, and the participant setup steps.
export const INSTALL_VIDEO_ANDROID = 'https://www.loom.com/share/244dcdeda1ce4ebe959a8b70a0df9006';
export const INSTALL_VIDEO_IOS = 'https://www.loom.com/share/c7cb2b0378ae439db52eb8f773857529';

/** Lines for a WhatsApp or email message: what to do, and the video for each phone. */
export const installVideoLines = (): string =>
  'Next, watch the short video for your phone. It shows how to add the app to your Home Screen and turn on notifications, so you never miss a class or a message.\n'
  + `Android: ${INSTALL_VIDEO_ANDROID}\n`
  + `iPhone: ${INSTALL_VIDEO_IOS}`;

/** The message a support sends someone who has signed in but still needs the app set up. */
export const appNudgeMessage = (firstName: string, reason: 'NOT_INSTALLED' | 'NO_ALERTS', senderName?: string | null): string => {
  const hello = `Hi ${firstName}${senderName ? `, it's ${senderName} from FOF` : ''}.`;
  const videos = `Android: ${INSTALL_VIDEO_ANDROID}\niPhone: ${INSTALL_VIDEO_IOS}`;
  return reason === 'NOT_INSTALLED'
    ? `${hello} I can see you have signed in to the FOF app. Well done!\n\nTo get your class and group reminders, please add the app to your Home Screen. This short video shows how:\n\n${videos}\n\nAfter you open it from your Home Screen, tap *Allow* when it asks about notifications. Message me if you get stuck.`
    : `${hello} You have the FOF app. Thank you!\n\nOne thing is left: alerts are still off, so you will not get your class and group reminders.\n\nOpen the app and tap *Allow* when it asks about notifications. If it does not ask, go to *Profile → Reminders* and tap *Enable on this device*. The video for your phone shows how:\n\n${videos}`;
};
