export function participantRemovalMode(hasGameHistory: boolean): 'deleted' | 'deactivated' {
  return hasGameHistory ? 'deactivated' : 'deleted';
}
