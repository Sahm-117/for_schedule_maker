// The temporary password someone just logged in with, kept in memory only (never
// stored) so the forced "Choose a new password" screen doesn't ask for it again.
// Gone after a reload, when that screen falls back to asking for it.
let loginPassword: string | null = null;

export const getLoginPassword = () => loginPassword;
export const setLoginPassword = (password: string | null) => { loginPassword = password; };
