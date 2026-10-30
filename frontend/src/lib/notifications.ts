export type Notice = { message: string; tone: 'success' | 'info' | 'error'; title?: string };
export const notificationEvent = 'tombola:notification';

export function notify(notice: Notice) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<Notice>(notificationEvent, { detail: notice }));
}

function hasLocalFeedback(path: string) {
  return /\/participant\/play\/rounds\/[^/]+\/(marks|claims)/.test(path);
}

export function mutationSucceeded(path: string, method: string, body?: unknown) {
  if (method === 'GET' || path === '/participant/play/join' || hasLocalFeedback(path) || /\/marks(?:\/|$)/.test(path) || path.includes('validate-bank')) return;
  if (path.endsWith('/participants/import') && body && typeof body === 'object' && 'createdCount' in body && 'skippedCount' in body && 'failedCount' in body) {
    notify({ tone: Number(body.failedCount) || Number(body.skippedCount) ? 'info' : 'success', title: 'Import finished', message: `${body.createdCount} players added, ${body.skippedCount} skipped, ${body.failedCount} failed. Review the row results below.` });
    return;
  }
  let message = 'Your changes have been saved.';
  if (path === '/auth/login') message = 'You’re signed in. Welcome to Tech Tambola.';
  else if (path === '/auth/logout') message = 'You’ve been signed out.';
  else if (path.includes('password')) message = 'Your password has been changed. Sign in again with your new password.';
  else if (path.endsWith('/join')) message = 'You’ve joined the game. Your ticket is ready.';
  else if (path.endsWith('/verify')) message = 'Claim approved. The winner has been recorded.';
  else if (path.endsWith('/reject')) message = 'Claim rejected. The participant can see the updated result.';
  else if (method === 'DELETE') message = 'Removed successfully. The list has been updated.';
  else if (path === '/super-admin/admins' && method === 'POST') message = 'Administrator created. Save the temporary password shown on this page.';
  else if (path === '/admin/participants' && method === 'POST') message = 'Player added. They can sign in using the email and password you entered.';
  else if (/\/admin\/participants\/[^/]+$/.test(path)) message = 'Player details and access have been updated.';
  else if (path === '/admin/play/rounds' && method === 'POST') message = 'Game created. Share its game code when you’re ready for players to join.';
  else if (path.endsWith('/commands')) message = 'The game has been updated. Players will receive the latest state.';
  else if (path.endsWith('/broadcast')) message = 'Game visibility has been updated in the participant lobby.';
  notify({ message, tone: 'success', title: 'Success' });
}

export function mutationFailed(path: string, method: string, status: number, serverMessage?: string) {
  if (method === 'GET' || hasLocalFeedback(path)) return;
  const message = status === 401
    ? path === '/auth/login' ? 'That email and password don’t match. Check both and try again.' : 'Your session has ended. Sign in again to continue.'
    : status === 403 ? 'Your account can’t do this. Contact your administrator if you need access.'
    : status === 429 ? 'Too many attempts. Wait a moment before trying again.'
    : status === 0 || status >= 500 ? 'We couldn’t confirm the change. Check your connection and refresh the page before trying again.'
    : serverMessage ?? 'We couldn’t save that. Check the details and try again.';
  notify({ message, tone: 'error', title: 'Action not completed' });
}
