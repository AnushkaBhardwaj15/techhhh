import { useState, useId } from 'react';
import { Link } from 'react-router-dom';
import styles from './DevelopersPage.module.css';

export interface Developer {
  id: string;
  name: string;
  role: string;
  channel: string;
  image: string;
  tagline: string;
  bio: string;
  arsenal: string[];
  superpower: string;
  github?: string;
}

export const DEVELOPERS: Developer[] = [
  {
    id: 'saransh',
    name: 'Saransh Sharma',
    role: 'Tech Head',
    channel: 'CH-01',
    image: '/team/saransh.jpg',
    tagline: 'Architecting high-concurrency engine & cryptographic game fairness.',
    bio: 'Lead architect of Tech Tombola. Designed the distributed engine, cryptographic PRNG randomizer, state transitions, and server-authoritative win validation ensuring zero-drift performance for 500+ live players.',
    arsenal: ['System Architecture', 'Cryptographic PRNG', 'Concurrency Control', 'Fastify / Bun', 'Game Authority'],
    superpower: 'Zero-tolerance for state drift and sub-millisecond draw synchronization.',
    github: 'https://github.com/saransh-sh',
  },
  {
    id: 'abhi',
    name: 'Abhi',
    role: 'Tech Executive',
    channel: 'CH-02',
    image: '/team/abhi.jpg',
    tagline: 'Real-time state synchronization, fault-tolerant pipelines & game flow.',
    bio: 'Spearheads real-time event distribution and gameplay synchronization. Optimized WebSocket packet delivery, instant claim verification, and live disconnect recovery to deliver a seamless participant experience.',
    arsenal: ['WebSocket Streams', 'Real-Time Sync', 'State Engines', 'Performance Tuning', 'Game Mechanics'],
    superpower: 'Resilient real-time pipelines that thrive under tournament pressure.',
    github: 'https://github.com',
  },
  {
    id: 'anushka',
    name: 'Anushka Bhardwaj',
    role: 'Tech Executive',
    channel: 'CH-03',
    image: '/team/anushka.jpg',
    tagline: 'Neobrutalist design systems, responsive tickets & tactile motion.',
    bio: 'Core author of the frontend interface and interaction design. Engineered the 15-cell responsive ticket grid, single-line mobile navigation bar, high-voltage Retro Orange palette, and GSAP micro-animations.',
    arsenal: ['React 19 & Vite', 'Neobrutalism UI', 'GSAP Motion', 'Responsive Layouts', 'A11y & Touch UX'],
    superpower: 'Pixel-perfect typography, bold tactile contrast, and silky 60fps animations.',
    github: 'https://github.com/AnushkaBhardwaj15',
  },
  {
    id: 'ashutosh',
    name: 'Ashutosh Singh',
    role: 'Techno Ambassador',
    channel: 'CH-04',
    image: '/team/ashutosh.jpg',
    tagline: 'Operational bridge, developer evangelism & tournament execution.',
    bio: 'Bridging engineering rigor with live event execution. Spearheaded participant onboarding workflows, staff administration tools, community engagement, and tournament staging for seamless audience coordination.',
    arsenal: ['Developer Evangelism', 'Event Operations', 'Admin Workflows', 'Participant Systems', 'Incident Response'],
    superpower: 'Connecting people and technology with effortless clarity and composure.',
    github: 'https://github.com',
  },
];

const CHYRON_BULLETINS = [
  'SARANSH SHARMA (TECH HEAD): ARCHITECTING SECURE WEBSOCKET INVARIANTS & PRNG RANDOMIZATION',
  'ABHI (TECH EXECUTIVE): DRIVING HIGH-PERFORMANCE REAL-TIME STATE SYNC & TOURNAMENT RECOVERY',
  'ANUSHKA BHARDWAJ (TECH EXECUTIVE): CRAFTING RESPONSIVE NEOBRUTALIST TICKETS & FLUID MOTION',
  'ASHUTOSH SINGH (TECHNO AMBASSADOR): SPEARHEADING PARTICIPANT ONBOARDING & EVENT EVANGELISM',
  'TECH TOMBOLA 2026: POWERED BY FASTIFY, POSTGRESQL & REACT 19 — NOT A QUIZ, PURE SPEED',
];

export function DevelopersPage() {
  const [selectedId, setSelectedId] = useState<string>('saransh');
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isFast, setIsFast] = useState<boolean>(false);
  const [scanlinesActive, setScanlinesActive] = useState<boolean>(true);

  const selectedDev = DEVELOPERS.find((d) => d.id === selectedId) || DEVELOPERS[0];
  const headlineId = useId();

  // Duplicate for seamless infinite marquee loop
  const tickerItems = [...DEVELOPERS, ...DEVELOPERS, ...DEVELOPERS];

  return (
    <div
      className={`${styles.page} ${scanlinesActive ? styles.scanlinesActive : ''}`}
      data-testid="developers-container"
    >
      {/* CRT Scanline Overlay Effect */}
      <div className={styles.scanlinesOverlay} aria-hidden="true" />

      {/* Top Broadcast Telemetry Bar */}
      <header className={styles.broadcastTopBar} role="banner">
        <div className={styles.broadcastMeta}>
          <span className={styles.liveBadge} aria-label="Live on air status">
            <span className={styles.pulseDot} aria-hidden="true" />
            LIVE BROADCAST
          </span>
          <span className={styles.channelId}>CHANNEL 01 // MUACM TV</span>
          <span className={styles.telemetryStrip} aria-hidden="true">
            RES: 4K UHD · 60FPS · SIGNAL: OPTIMAL · LATENCY: 14MS
          </span>
        </div>

        <div className={styles.topControls}>
          <button
            type="button"
            className={`${styles.broadcastButton} ${scanlinesActive ? styles.activeButton : ''}`}
            onClick={() => setScanlinesActive(!scanlinesActive)}
            aria-label="Toggle TV scanlines effect"
          >
            ⚡ {scanlinesActive ? 'SCANLINES ON' : 'SCANLINES OFF'}
          </button>
          <Link to="/" className={styles.returnLink} aria-label="Return to home page">
            ← RETURN TO HOME
          </Link>
        </div>
      </header>

      {/* Hero Header */}
      <main id="main-content">
        <section className={styles.heroHeader} aria-labelledby={headlineId}>
          <div className={styles.heroTaglineRow}>
            <span className={styles.studioTag}>MUACM PRODUCTION STUDIOS</span>
            <span className={styles.editionTag}>TECH TOMBOLA 2026</span>
          </div>
          <h1 id={headlineId} className={styles.headline}>
            MEET THE DEVELOPERS
          </h1>
          <p className={styles.subheadline}>
            The engineering architects, real-time mechanics, interface designers, and ambassadors
            powering Tech Tombola&apos;s digital tournament for 500+ synchronized participants.
          </p>
        </section>

        {/* Moving TV Banner / Crawler Marquee */}
        <section className={styles.movingBannerSection} aria-label="Moving TV Banner">
          <div className={styles.bannerTopBar}>
            <div className={styles.bannerLabelGroup}>
              <span>● LIVE CRAWL BANNER</span>
              <span aria-hidden="true">///</span>
              <span>TAP ANY CARD TO SPOTLIGHT</span>
            </div>
            <div className={styles.bannerControls}>
              <button
                type="button"
                className={styles.tickerControlButton}
                onClick={() => setIsFast(!isFast)}
                aria-label={`Toggle speed: currently ${isFast ? 'fast' : 'normal'}`}
              >
                SPEED: {isFast ? '1.5X' : '1.0X'}
              </button>
              <button
                type="button"
                className={styles.tickerControlButton}
                onClick={() => setIsPaused(!isPaused)}
                aria-label={isPaused ? 'Resume ticker' : 'Pause ticker'}
              >
                {isPaused ? '▶ RESUME' : '⏸ PAUSE'}
              </button>
            </div>
          </div>

          <div
            className={styles.tickerContainer}
            tabIndex={0}
            role="region"
            aria-label="Interactive developer ticker"
          >
            <div
              className={`${styles.tickerTrack} ${isFast ? styles.speedFast : ''} ${
                isPaused ? styles.paused : ''
              }`}
            >
              {tickerItems.map((dev, index) => {
                const isCurrent = dev.id === selectedId;
                return (
                  <button
                    key={`${dev.id}-${index}`}
                    type="button"
                    className={`${styles.tickerCard} ${isCurrent ? styles.activeCard : ''}`}
                    onClick={() => setSelectedId(dev.id)}
                    aria-label={`Spotlight ${dev.name}, ${dev.role}`}
                  >
                    <div className={styles.tickerThumbFrame}>
                      <img
                        src={dev.image}
                        alt=""
                        aria-hidden="true"
                        className={styles.tickerThumb}
                        loading="lazy"
                      />
                    </div>
                    <div className={styles.tickerInfo}>
                      <div className={styles.tickerChannelRow}>
                        <span className={styles.tickerChannel}>{dev.channel}</span>
                        <span className={styles.tickerLiveDot}>● LIVE</span>
                      </div>
                      <span className={styles.tickerName}>{dev.name}</span>
                      <span className={styles.tickerRoleBadge}>{dev.role}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Center Stage: TV Broadcast Spotlight Monitor */}
        <section className={styles.spotlightSection} aria-labelledby="spotlight-title">
          <div className={styles.tvMonitor}>
            {/* TV Monitor Header & Channel Tabs */}
            <div className={styles.tvMonitorHeader}>
              <div className={styles.channelTabs} role="tablist" aria-label="Developer channels">
                {DEVELOPERS.map((dev) => {
                  const isActive = dev.id === selectedId;
                  return (
                    <button
                      key={dev.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className={`${styles.channelTab} ${isActive ? styles.activeChannelTab : ''}`}
                      onClick={() => setSelectedId(dev.id)}
                    >
                      [{dev.channel}] {dev.name}
                    </button>
                  );
                })}
              </div>

              <div className={styles.monitorStatus}>
                <span className={styles.recIndicator}>
                  <span className={styles.recDot} aria-hidden="true" />
                  REC [00:42:19]
                </span>
                <span>FEED: PRIMARY</span>
              </div>
            </div>

            {/* TV Stage View */}
            <div className={styles.tvStageView}>
              {/* Left Column: TV Portrait & Signal Display */}
              <div className={styles.portraitWrapper}>
                <div className={styles.portraitFrame}>
                  {/* Corner Target Alignment Crosshairs */}
                  <span className={styles.cornerBracketTopLeft} aria-hidden="true" />
                  <span className={styles.cornerBracketTopRight} aria-hidden="true" />
                  <span className={styles.cornerBracketBottomLeft} aria-hidden="true" />
                  <span className={styles.cornerBracketBottomRight} aria-hidden="true" />

                  <img
                    src={selectedDev.image}
                    alt={selectedDev.name}
                    className={styles.spotlightImage}
                  />

                  {/* Broadcast Lower Badge */}
                  <div className={styles.portraitLowerBadge}>
                    <span>{selectedDev.channel} // ON STAGE</span>
                    <div className={styles.equalizerBar} aria-hidden="true">
                      <span className={styles.eqColumn} />
                      <span className={styles.eqColumn} />
                      <span className={styles.eqColumn} />
                      <span className={styles.eqColumn} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Dossier Content */}
              <div className={styles.dossierContent}>
                <div className={styles.dossierHeader}>
                  <div className={styles.dossierTagGroup}>
                    <span className={styles.roleHighlightBadge}>{selectedDev.role}</span>
                    <span className={styles.verifiedPill}>VERIFIED ARCHITECT</span>
                  </div>
                  <h2
                    id="spotlight-title"
                    className={styles.spotlightName}
                    data-testid="spotlight-name"
                  >
                    {selectedDev.name}
                  </h2>
                  <p className={styles.spotlightTagline}>&ldquo;{selectedDev.tagline}&rdquo;</p>
                </div>

                <p className={styles.dossierBio}>{selectedDev.bio}</p>

                <div className={styles.superpowerBlock}>
                  <span className={styles.superpowerLabel}>Core Mission & Superpower</span>
                  <p className={styles.superpowerText}>{selectedDev.superpower}</p>
                </div>

                <div className={styles.arsenalSection}>
                  <span className={styles.arsenalLabel}>Specialized Arsenal & Focus Areas</span>
                  <div className={styles.arsenalPills}>
                    {selectedDev.arsenal.map((skill) => (
                      <span key={skill} className={styles.arsenalPill}>
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>

                {selectedDev.github && (
                  <div className={styles.profileActionRow}>
                    <a
                      href={selectedDev.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.githubLink}
                    >
                      <span>View GitHub Profile ↗</span>
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Full Squad Roster Grid */}
        <section className={styles.rosterSection} aria-labelledby="roster-heading">
          <div className={styles.rosterSectionHeader}>
            <div className={styles.rosterTitleGroup}>
              <span className={styles.rosterEyebrow}>CORE TEAM DOSSIERS</span>
              <h2 id="roster-heading" className={styles.rosterTitle}>
                THE FULL SQUAD
              </h2>
            </div>
            <span className={styles.studioTag}>4 SPECIALISTS</span>
          </div>

          <div className={styles.rosterGrid}>
            {DEVELOPERS.map((dev) => {
              const isActive = dev.id === selectedId;
              return (
                <article
                  key={dev.id}
                  className={`${styles.rosterCard} ${isActive ? styles.activeRosterCard : ''}`}
                >
                  <div className={styles.cardTopRow}>
                    <span className={styles.cardChannelTag}>{dev.channel}</span>
                    <span className={styles.cardRoleTag}>{dev.role}</span>
                  </div>

                  <div className={styles.cardImageFrame}>
                    <img src={dev.image} alt={dev.name} className={styles.cardImage} />
                  </div>

                  <div className={styles.cardDetails}>
                    <h3 className={styles.cardName}>{dev.name}</h3>
                    <p className={styles.cardTagline}>{dev.tagline}</p>
                    <div className={styles.cardSkillsStrip}>
                      {dev.arsenal.slice(0, 3).map((s) => (
                        <span key={s} className={styles.cardSkillChip}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    className={styles.spotlightButton}
                    onClick={() => {
                      setSelectedId(dev.id);
                      window.scrollTo({ top: 320, behavior: 'smooth' });
                    }}
                    aria-label={`View full dossier for ${dev.name}`}
                  >
                    <span>{isActive ? 'CURRENTLY ON AIR' : 'SWITCH TO BROADCAST'}</span>
                    <span aria-hidden="true">→</span>
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      </main>

      {/* Bottom Television Chyron / News Crawler */}
      <footer className={styles.bottomChyron} role="contentinfo" aria-label="Broadcast news ticker">
        <div className={styles.chyronLabel}>
          <span>BREAKING BULLETIN ❯❯</span>
        </div>
        <div className={styles.chyronTrackWrapper}>
          <div className={styles.chyronTrack}>
            {CHYRON_BULLETINS.concat(CHYRON_BULLETINS).map((bulletin, idx) => (
              <span key={idx} className={styles.chyronItem}>
                <span className={styles.chyronBullet}>●</span> {bulletin}
              </span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
