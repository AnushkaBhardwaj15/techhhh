import { Link } from 'react-router-dom';
import { TEAM_MEMBERS } from './teamData';
import type { TeamMember } from './teamData';
import styles from './TeamPage.module.css';

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function GitHubIcon({ width = '14', height = '14' }: { width?: string; height?: string }) {
  return (
    <svg
      className={styles.socialLinkIcon}
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
    </svg>
  );
}

function LinkedInIcon({ width = '14', height = '14' }: { width?: string; height?: string }) {
  return (
    <svg
      className={styles.socialLinkIcon}
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      className={styles.socialLinkIcon}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v2h20v-2c0-3.3-6.7-5-10-5z" />
    </svg>
  );
}

function MemberCard({ member }: { member: TeamMember }) {
  const hasPhoto = member.photoUrl.length > 0;
  const hasGithub = member.github.length > 0;
  const hasLinkedin = member.linkedin.length > 0;

  return (
    <article className={styles.memberCard}>
      <div className={styles.avatarWrap}>
        {hasPhoto ? (
          <img
            src={member.photoUrl}
            alt={`Photo of ${member.name}`}
            className={styles.avatarImage}
            loading="lazy"
          />
        ) : (
          <div className={styles.avatarFallback} aria-label={`Avatar placeholder for ${member.name}`}>
            <span className={styles.avatarInitials}>{getInitials(member.name)}</span>
            <span className={styles.avatarIcon}>
              <UserIcon />
            </span>
          </div>
        )}
      </div>

      <div className={styles.cardBody}>
        <h3 className={styles.memberName}>{member.name}</h3>
        <span className={styles.memberRole}>{member.role}</span>

        <div className={styles.socialLinks}>
          {hasGithub && (
            <a
              href={member.github}
              target="_blank"
              rel="noreferrer"
              className={styles.socialLink}
              aria-label={`${member.name} on GitHub`}
            >
              <GitHubIcon />
              <span>GitHub</span>
              <span aria-hidden="true">↗</span>
            </a>
          )}
          {hasLinkedin && (
            <a
              href={member.linkedin}
              target="_blank"
              rel="noreferrer"
              className={styles.socialLink}
              aria-label={`${member.name} on LinkedIn`}
            >
              <LinkedInIcon />
              <span>LinkedIn</span>
              <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export function TeamPage() {
  return (
    <div className={styles.page}>
      {/* Sticky Navbar */}
      <header className={styles.navbar} role="banner">
        <div className={styles.navContainer}>
          <div className={styles.brandGroup}>
            <Link to="/" className={styles.wordmark} aria-label="Tech Tombola Home">
              <span className={styles.brandBadge}>TECH</span>
              <strong>TOMBOLA</strong>
            </Link>
          </div>
          <div className={styles.navActions}>
            <Link to="/" className={styles.backButton}>
              <span>← HOME</span>
            </Link>
          </div>
        </div>
      </header>

      <main id="main-content">
        {/* Hero Header */}
        <section className={styles.heroSection} aria-labelledby="team-hero-title">
          <span className={styles.eyebrow}>MUACM 2026 · ENGINEERING TEAM</span>
          <h1 id="team-hero-title" className={styles.headline}>
            Meet the <span className={styles.headlineAccent}>Developers.</span>
          </h1>
          <p className={styles.subtitle}>
            The engineers who designed, built, and shipped Tech Tombola — a real-time digital
            Tombola engine for 500+ concurrent players, from zero to production.
          </p>
        </section>

        {/* Team Grid */}
        <section className={styles.teamGrid} aria-label="Development team members">
          {TEAM_MEMBERS.map((member) => (
            <MemberCard key={member.id} member={member} />
          ))}
        </section>

        {/* Tribute Strip */}
        <section className={styles.tributeStrip} aria-labelledby="tribute-title">
          <div className={styles.tributeContent}>
            <span className={styles.tributeKicker}>BUILT WITH</span>
            <h2 id="tribute-title" className={styles.tributeHeading}>
              Open-Source Stack. Zero Compromises.
            </h2>
            <p className={styles.tributeText}>
              Tech Tombola is powered entirely by open-source technologies. Engineered for the
              MUACM annual event with server-authoritative game state, native WebSocket streaming,
              and a Neobrutalist design system.
            </p>
            <div className={styles.techBadges}>
              <span className={styles.techBadge}>BUN</span>
              <span className={styles.techBadge}>TYPESCRIPT</span>
              <span className={styles.techBadge}>REACT</span>
              <span className={styles.techBadge}>VITE</span>
              <span className={styles.techBadge}>FASTIFY</span>
              <span className={styles.techBadge}>POSTGRESQL</span>
              <span className={styles.techBadge}>WEBSOCKET</span>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className={styles.footer} role="contentinfo">
        <div className={styles.footerContainer}>
          <span className={styles.footerWordmark}>
            <strong>TECH TOMBOLA</strong> · MUACM 2026
          </span>
          <div className={styles.footerLinks}>
            <Link to="/">Home</Link>
            <Link to="/login">Sign In</Link>
            <a href="#main-content">Back to Top ↑</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
