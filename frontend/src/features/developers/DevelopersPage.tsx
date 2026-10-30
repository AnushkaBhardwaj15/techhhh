import { Link } from 'react-router-dom';
import styles from './DevelopersPage.module.css';

interface Developer {
  id: string;
  name: string;
  role: string;
  image: string;
  tagline: string;
  bio: string;
  skills: string[];
  github?: string;
}

const DEVELOPERS: Developer[] = [
  {
    id: 'saransh',
    name: 'Saransh Sharma',
    role: 'Tech Head',
    image: '/team/saransh.jpg',
    tagline: 'System architecture, concurrency engine & cryptographic game fairness.',
    bio: 'Lead architect of Tech Tombola. Designed the distributed engine, cryptographic PRNG randomizer, state transitions, and server-authoritative win validation ensuring zero-drift performance for 500+ live players.',
    skills: ['System Architecture', 'Fastify / Bun', 'Concurrency Control', 'Security'],
    github: 'https://github.com/saransh-sh',
  },
  {
    id: 'abhi',
    name: 'Abhi',
    role: 'Tech Executive',
    image: '/team/abhi.jpg',
    tagline: 'Real-time state synchronization, fault-tolerant pipelines & game flow.',
    bio: 'Spearheads real-time event distribution and gameplay synchronization. Optimized WebSocket packet delivery, instant claim verification, and live disconnect recovery to deliver a seamless participant experience.',
    skills: ['WebSocket Streams', 'Real-Time Sync', 'State Engines', 'Performance'],
    github: 'https://github.com',
  },
  {
    id: 'anushka',
    name: 'Anushka Bhardwaj',
    role: 'Tech Executive',
    image: '/team/anushka.jpg',
    tagline: 'Neobrutalist design systems, responsive tickets & tactile motion.',
    bio: 'Core author of the frontend interface and interaction design. Engineered the 15-cell responsive ticket grid, single-line mobile navigation bar, high-voltage Retro Orange palette, and fluid micro-animations.',
    skills: ['React 19 & Vite', 'Neobrutalism UI', 'Responsive Design', 'A11y UX'],
    github: 'https://github.com/AnushkaBhardwaj15',
  },
  {
    id: 'ashutosh',
    name: 'Ashutosh Singh',
    role: 'Techno Ambassador',
    image: '/team/ashutosh.jpg',
    tagline: 'Tournament operations, participant onboarding & developer evangelism.',
    bio: 'Bridging engineering rigor with live event execution. Spearheaded participant onboarding workflows, staff administration tools, community engagement, and tournament staging for seamless audience coordination.',
    skills: ['Tournament Operations', 'Admin Workflows', 'Participant Systems', 'Evangelism'],
    github: 'https://github.com',
  },
];

export function DevelopersPage() {
  return (
    <div className={styles.page} data-testid="developers-container">
      {/* Top Navigation Bar */}
      <header className={styles.navbar} role="banner">
        <div className={styles.navContainer}>
          <div className={styles.brandGroup}>
            <Link to="/" className={styles.backLink} aria-label="Return to home page">
              <span aria-hidden="true">←</span> Back to Home
            </Link>
          </div>

          <div className={styles.navCenter}>
            <span className={styles.brandTitle}>TECH TOMBOLA</span>
            <span className={styles.editionBadge}>MUACM 2026</span>
          </div>

          <div className={styles.navActions}>
            <Link to="/login" className={styles.signInLink}>
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className={styles.main}>
        {/* Simple Hero Section */}
        <section className={styles.heroSection} aria-labelledby="hero-title">
          <div className={styles.heroKicker}>MEET THE DEVELOPER</div>
          <h1 id="hero-title" className={styles.heroTitle}>
            Meet the Developers
          </h1>
          <p className={styles.heroSubtitle}>
            The engineering, interface, and operational team behind Tech Tombola 2026 — built for
            500+ synchronized live participants at MUACM.
          </p>
        </section>

        {/* Clean Developer Cards Grid */}
        <section className={styles.teamSection} aria-label="Developer Profiles">
          <div className={styles.teamGrid}>
            {DEVELOPERS.map((dev) => (
              <article key={dev.id} className={styles.devCard} data-testid={`dev-card-${dev.id}`}>
                <div className={styles.cardHeader}>
                  <div className={styles.avatarWrapper}>
                    <img
                      src={dev.image}
                      alt={dev.name}
                      className={styles.avatarImg}
                      loading="lazy"
                    />
                  </div>
                  <div className={styles.headerInfo}>
                    <div className={styles.roleBadge}>{dev.role}</div>
                    <h2 className={styles.devName}>{dev.name}</h2>
                    <p className={styles.devTagline}>{dev.tagline}</p>
                  </div>
                </div>

                <div className={styles.cardBody}>
                  <p className={styles.devBio}>{dev.bio}</p>

                  <div className={styles.skillsWrapper}>
                    <span className={styles.skillsLabel}>Focus Areas:</span>
                    <div className={styles.skillTags}>
                      {dev.skills.map((skill) => (
                        <span key={skill} className={styles.skillTag}>
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {dev.github && (
                  <div className={styles.cardFooter}>
                    <a
                      href={dev.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.githubLink}
                      aria-label={`View ${dev.name}'s GitHub profile`}
                    >
                      <span>GitHub Profile</span>
                      <span aria-hidden="true">↗</span>
                    </a>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>

        {/* Simple Project Tech Stack Overview */}
        <section className={styles.techStackSection} aria-labelledby="tech-stack-title">
          <div className={styles.techStackCard}>
            <div className={styles.techStackHeader}>
              <h2 id="tech-stack-title" className={styles.techStackTitle}>
                The Technology Stack
              </h2>
              <p className={styles.techStackDesc}>
                Architected as a modular monolith for maximum reliability and sub-millisecond draw
                synchronization during live competitive play.
              </p>
            </div>
            <div className={styles.techStackBadges}>
              <span className={styles.techBadge}>⚡ Bun + Fastify</span>
              <span className={styles.techBadge}>⚛️ React 19 + Vite</span>
              <span className={styles.techBadge}>🐘 PostgreSQL</span>
              <span className={styles.techBadge}>🔄 Native WebSockets</span>
              <span className={styles.techBadge}>🎨 Neobrutalism UI</span>
              <span className={styles.techBadge}>🛡️ Zod Validation</span>
            </div>
          </div>
        </section>

        {/* Bottom CTA / Return */}
        <section className={styles.bottomNavSection}>
          <Link to="/" className={styles.bottomHomeLink}>
            <span aria-hidden="true">←</span> Back to Game Lobby
          </Link>
        </section>
      </main>

      {/* Simple Footer */}
      <footer className={styles.footer} role="contentinfo">
        <div className={styles.footerContainer}>
          <div className={styles.footerText}>
            <strong>TECH TOMBOLA</strong> · MUACM 2026 · Play Together. Mark Your Moment.
          </div>
          <div className={styles.footerLinks}>
            <Link to="/">Home</Link>
            <Link to="/meet-the-developer">Meet the Developer</Link>
            <Link to="/login">Sign In</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
