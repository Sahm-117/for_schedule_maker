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
