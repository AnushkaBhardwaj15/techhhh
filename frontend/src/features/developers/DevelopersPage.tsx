import { Link } from 'react-router-dom';
import styles from './DevelopersPage.module.css';

interface Developer {
  id: string;
  name: string;
  role: string;
  image: string;
  github?: string;
}

const DEVELOPERS: Developer[] = [
  {
    id: 'saransh',
    name: 'Saransh Sharma',
    role: 'Tech Head',
    image: '/team/anushka.jpg',
    github: 'https://github.com/saransh-sh',
  },
  {
    id: 'abhi',
    name: 'Abhi Dubey',
    role: 'Tech Executive',
    image: '/team/ashutosh.jpg',
    github: 'https://github.com',
  },
  {
    id: 'anushka',
    name: 'Anushka Bhardwaj',
    role: 'Tech Executive',
    image: '/team/abhi.jpg',
    github: 'https://github.com/AnushkaBhardwaj15',
  },
  {
    id: 'ashutosh',
    name: 'Ashutosh Singh',
    role: 'Techno Ambassador',
    image: '/team/saransh.jpg',
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
            The core team behind Tech Tombola 2026 at MUACM.
          </p>
        </section>

        {/* Clean, Simple Developer Cards Grid */}
        <section className={styles.teamSection} aria-label="Developer Profiles">
          <div className={styles.teamGrid}>
            {DEVELOPERS.map((dev) => (
              <article key={dev.id} className={styles.devCard} data-testid={`dev-card-${dev.id}`}>
                <div className={styles.avatarWrapper}>
                  <img
                    src={dev.image}
                    alt={dev.name}
                    className={styles.avatarImg}
                    loading="lazy"
                  />
                </div>

                <div className={styles.cardInfo}>
                  <div className={styles.roleBadge}>{dev.role}</div>
                  <h2 className={styles.devName}>{dev.name}</h2>
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
