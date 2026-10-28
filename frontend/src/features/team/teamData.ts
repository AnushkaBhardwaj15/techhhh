export interface TeamMember {
  id: string;
  name: string;
  role: string;
  photoUrl: string;
  github: string;
  linkedin: string;
}

/**
 * Tech Tombola core development team.
 * Edit this array to add/remove/reorder team members.
 * The TeamPage component renders cards from this data.
 */
export const TEAM_MEMBERS: TeamMember[] = [
  {
    id: 'anushka',
    name: 'Anushka Bhardwaj',
    role: 'Full Stack Engineer — Frontend & Backend',
    photoUrl: '',
    github: 'https://github.com/AnushkaBhardwaj15',
    linkedin: '',
  },
  {
    id: 'saransh',
    name: 'Saransh Sharma',
    role: 'System Architect — Backend & Optimizations Lead',
    photoUrl: '',
    github: 'https://github.com/saransh-sh',
    linkedin: '',
  },
  {
    id: 'ashutosh',
    name: 'Ashutosh Singh',
    role: 'DevOps & Backend Refinements',
    photoUrl: '',
    github: 'https://github.com/singhashutosh4123',
    linkedin: '',
  },
  {
    id: 'abhi',
    name: 'Abhi Dubey',
    role: 'Frontend Engineer',
    photoUrl: '',
    github: '',
    linkedin: '',
  },
];
