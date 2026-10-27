import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { getMe, quickJoin } from '../../lib/api/auth';
import { useAuthUiStore } from '../auth/authStore';
import { roleHomePath } from '../auth/routing';
import { SampleTicketDemo } from './components/SampleTicketDemo';
import styles from './LandingPage.module.css';

export function LandingPage() {
  const [joinName, setJoinName] = useState('');
  const [joinEmail, setJoinEmail] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const identityChanged = useAuthUiStore((state) => state.identityChanged);

  const sessionVersion = useAuthUiStore((state) => state.sessionVersion);
  const session = useQuery({
    queryKey: ['auth', 'me', sessionVersion],
    queryFn: ({ signal }) => getMe(signal),
    retry: false,
  });

  async function handleQuickJoin(e: FormEvent) {
    e.preventDefault();
    if (!joinName.trim() || !joinEmail.trim() || joinPassword.length < 8) {
      setJoinError('Enter your name, email, and a password of at least 8 characters.');
      return;
    }
    setJoining(true);
    setJoinError('');
    try {
      const user = await quickJoin(joinName.trim(), joinEmail.trim(), joinPassword);
      setJoinPassword('');
      identityChanged();
      queryClient.clear();
      navigate(roleHomePath(user.role), { replace: true });
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Could not join event. Try again.');
    } finally {
      setJoining(false);
    }
  }

  const user = session.data;
  const destination = user ? (user.role === 'PARTICIPANT' ? '/lobby' : roleHomePath(user.role)) : '/login';
  const ctaText = user ? `ENTER ${user.role === 'PARTICIPANT' ? 'LOBBY' : 'DASHBOARD'}` : 'SIGN IN TO PLAY';

  return (
    <div className={styles.page}>
      {/* Sticky Navigation Bar */}
      <header className={styles.navbar} role="banner">
        <div className={styles.navContainer}>
          <div className={styles.brandGroup}>
            <Link to="/" className={styles.wordmark} aria-label="Tech Tambola Home">
              <span className={styles.brandBadge}>TECH</span>
              <strong>TAMBOLA</strong>
            </Link>
            <span className={styles.editionBadge}>MUACM 2026</span>
          </div>

          <nav className={styles.navLinks} aria-label="Main landing navigation">
            <a href="#how-it-works" className={styles.navItem}>
              How to Play
            </a>
            <a href="#sample-ticket" className={styles.navItem}>
              Interactive Card
            </a>
            <a href="#patterns" className={styles.navItem}>
              Winning Patterns
            </a>
          </nav>

          <div className={styles.navActions}>
            <Link to={destination} className={styles.navCta}>
              {ctaText}
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main id="main-content">
        <section className={styles.heroSection} aria-labelledby="hero-title">
          <div className={styles.heroContent}>
            <div className={styles.heroHeader}>
              <div className={styles.eyebrowContainer}>
                <span className={styles.eyebrow}>MUACM ANNUAL TECH EVENT</span>
                <span className={styles.badgeRule}>·</span>
                <span className={styles.eyebrowAccent}>SYNCHRONIZED DIGITAL TAMBOLA</span>
              </div>
              <h1 id="hero-title" className={styles.heroHeadline}>
                Listen for the clue.
                <br />
                Spot the key.
                <br />
                <em>Claim the win.</em>
              </h1>
              <p className={styles.heroSubtitle}>
                Tech Tambola is <strong>not a quiz</strong>. A question is a clue; its answer key is
                revealed by the game engine. Find that key on your 15-cell ticket, mark it manually,
                and claim winning patterns in real time with server-authoritative verification.
              </p>

              <div className={styles.heroCtaGroup}>
                <Link to={destination} className={styles.primaryButton}>
                  <span>{ctaText}</span>
                  <span className={styles.buttonArrow} aria-hidden="true">↗</span>
                </Link>
              </div>

              {!user && (
                <div className={styles.quickJoinBox}>
                  <div className={styles.quickJoinHeader}>
                    <span className={styles.quickJoinBadge}>
                      INSTANT GAME ENTRY
                    </span>
                    <span className={styles.quickJoinMeta}>
                      SECURE PARTICIPANT ENTRY
                    </span>
                  </div>
                  <p className={styles.quickJoinText}>
                    Create your participant account or enter your existing password to join the event.
                  </p>
                  <form onSubmit={handleQuickJoin} className={styles.quickJoinForm}>
                    <input
                      type="text"
                      placeholder="Your Full Name"
                      aria-label="Full name"
                      autoComplete="name"
                      value={joinName}
                      onChange={(e) => setJoinName(e.target.value)}
                      required
                      className={styles.quickJoinInput}
                    />
                    <input
                      type="email"
                      placeholder="Your Email"
                      aria-label="Email address"
                      autoComplete="email"
                      value={joinEmail}
                      onChange={(e) => setJoinEmail(e.target.value)}
                      required
                      className={styles.quickJoinInput}
                    />
                    <input type="password" aria-label="Password" placeholder="Password (at least 8 characters)" autoComplete="current-password" minLength={8} required value={joinPassword} onChange={(e) => setJoinPassword(e.target.value)} className={styles.quickJoinInput} />
                    <button
                      type="submit"
                      disabled={joining}
                      className={styles.quickJoinBtn}
                    >
                      {joining ? 'JOINING…' : 'GET TICKET & PLAY ↗'}
                    </button>
                  </form>
                  {joinError && (
                    <p className={styles.quickJoinError} role="alert">
                      {joinError}
                    </p>
                  )}
                </div>
              )}

              {/* Statistics & Confidence Strip */}
              <div className={styles.statsStrip} aria-label="Game engine specifications">
                <div className={styles.statItem}>
                  <strong>500+</strong>
                  <span>Active Players</span>
                </div>
                <div className={styles.statDivider} />
                <div className={styles.statItem}>
                  <strong>15 / 27</strong>
                  <span>Populated Cells</span>
                </div>
                <div className={styles.statDivider} />
                <div className={styles.statItem}>
                  <strong>0</strong>
                  <span>Guessing Penalty</span>
                </div>
                <div className={styles.statDivider} />
                <div className={styles.statItem}>
                  <strong>100%</strong>
                  <span>Server Validated</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Interactive Sample Ticket Demo Section */}
        <section id="sample-ticket" className={styles.demoSection} aria-labelledby="demo-title">
          <div className={styles.sectionHeader}>
            <p className={styles.sectionKicker}>HANDS-ON PREVIEW</p>
            <h2 id="demo-title">Test-drive the 15-Key Ticket.</h2>
            <p className={styles.sectionLead}>
              Every player receives a 3-row × 9-column card with exactly 15 technology keys (5 per
              row). Try marking keys below or click "Simulate Next Clue" to watch how clues map to
              revealed keys!
            </p>
          </div>

          <div className={styles.demoContainer}>
            <SampleTicketDemo />
          </div>
        </section>

        {/* How It Works Section */}
        <section id="how-it-works" className={styles.stepsSection} aria-labelledby="steps-title">
          <div className={styles.sectionHeader}>
            <p className={styles.sectionKicker}>THE GAME FLOW</p>
            <h2 id="steps-title">Four steps to victory.</h2>
            <p className={styles.sectionLead}>
              No typing answers. No speed-typing buzzers. Just technical knowledge, rapid visual
              scanning, and instant server claims.
            </p>
          </div>

          <div className={styles.stepsGrid}>
            <div className={styles.stepCard}>
              <span className={styles.stepNum}>01</span>
              <h3>Clue Broadcast</h3>
              <p>
                The game engine reveals a technical clue on all participant screens and the auditorium
                projector (e.g. <em>"The container runtime standard developed by Solomon Hykes"</em>).
              </p>
            </div>

            <div className={styles.stepCard}>
              <span className={styles.stepNum}>02</span>
              <h3>Key Revealed</h3>
              <p>
                The host engine reveals the authoritative answer key: <strong>DOCKER</strong>. You
                don't guess or type; the key is shown to everyone simultaneously.
              </p>
            </div>

            <div className={styles.stepCard}>
              <span className={styles.stepNum}>03</span>
              <h3>Locate & Mark</h3>
              <p>
                Scan your 15-key card. If <strong>DOCKER</strong> is present on your ticket, tap it.
                Your mark is immediately validated and saved on the server.
              </p>
            </div>

            <div className={styles.stepCard}>
              <span className={styles.stepNum}>04</span>
              <h3>Claim the Win</h3>
              <p>
                Completed Early 5, a row, or the Full House? Hit <strong>Claim</strong> immediately.
                The server verifies your winning cells with zero room for dispute.
              </p>
            </div>
          </div>
        </section>

        {/* Winning Patterns Section */}
        <section id="patterns" className={styles.patternsSection} aria-labelledby="patterns-title">
          <div className={styles.sectionHeader}>
            <p className={styles.sectionKicker}>PATTERN RECOGNITION</p>
            <h2 id="patterns-title">5 Winning Configurations.</h2>
            <p className={styles.sectionLead}>
              Once a winning pattern is verified by the host, that pattern closes for the remainder
              of the round. Play attentively!
            </p>
          </div>

          <div className={styles.patternCardsGrid}>
            <div className={styles.patternRuleCard}>
              <div className={styles.patternCardHeader}>
                <span className={styles.patternPill}>PATTERN 1</span>
                <h3>Early 5</h3>
              </div>
              <p>
                The first participant to mark <strong>any 5 keys</strong> anywhere across their 3×9
                ticket.
              </p>
              <div className={styles.miniGridPreview} aria-hidden="true">
                <div className={styles.miniRow}>
                  <span className={styles.miniMarked}>✓</span>
                  <span>·</span>
                  <span className={styles.miniMarked}>✓</span>
                  <span>·</span>
                  <span>·</span>
                </div>
                <div className={styles.miniRow}>
                  <span>·</span>
                  <span className={styles.miniMarked}>✓</span>
                  <span>·</span>
                  <span>·</span>
                  <span className={styles.miniMarked}>✓</span>
                </div>
                <div className={styles.miniRow}>
                  <span>·</span>
                  <span>·</span>
                  <span className={styles.miniMarked}>✓</span>
                  <span>·</span>
                  <span>·</span>
                </div>
              </div>
            </div>

            <div className={styles.patternRuleCard}>
              <div className={styles.patternCardHeader}>
                <span className={styles.patternPill}>PATTERN 2</span>
                <h3>Top Line</h3>
              </div>
              <p>
                All <strong>5 keys in Row 1</strong> marked. Four blank slots in the row are ignored.
              </p>
              <div className={styles.miniGridPreview} aria-hidden="true">
                <div className={styles.miniRow}>
                  <span className={styles.miniMarked}>✓</span>
                  <span className={styles.miniMarked}>✓</span>
                  <span className={styles.miniMarked}>✓</span>
                  <span className={styles.miniMarked}>✓</span>
                  <span className={styles.miniMarked}>✓</span>
                </div>
                <div className={styles.miniRow}>
                  <span>·</span>
                  <span>·</span>
                  <span>·</span>
                  <span>·</span>
                  <span>·</span>
                </div>
                <div className={styles.miniRow}>
                  <span>·</span>
                  <span>·</span>
                  <span>·</span>
                  <span>·</span>
                  <span>·</span>
                </div>
              </div>
            </div>

            <div className={styles.patternRuleCard}>
              <div className={styles.patternCardHeader}>
                <span className={styles.patternPill}>PATTERN 3</span>
                <h3>Middle Line</h3>
              </div>
              <p>
                All <strong>5 keys in Row 2</strong> marked across your ticket.
              </p>
              <div className={styles.miniGridPreview} aria-hidden="true">
                <div className={styles.miniRow}>
                  <span>·</span>
                  <span>·</span>
                  <span>·</span>
                  <span>·</span>
                  <span>·</span>
                </div>
                <div className={styles.miniRow}>
                  <span className={styles.miniMarked}>✓</span>
                  <span className={styles.miniMarked}>✓</span>
                  <span className={styles.miniMarked}>✓</span>
                  <span className={styles.miniMarked}>✓</span>
                  <span className={styles.miniMarked}>✓</span>
                </div>
                <div className={styles.miniRow}>
                  <span>·</span>
                  <span>·</span>
                  <span>·</span>
                  <span>·</span>
                  <span>·</span>
                </div>
              </div>
            </div>

            <div className={styles.patternRuleCard}>
              <div className={styles.patternCardHeader}>
                <span className={styles.patternPill}>PATTERN 4</span>
                <h3>Bottom Line</h3>
              </div>
              <p>
                All <strong>5 keys in Row 3</strong> marked across your ticket.
              </p>
              <div className={styles.miniGridPreview} aria-hidden="true">
                <div className={styles.miniRow}>
                  <span>·</span>
                  <span>·</span>
                  <span>·</span>
                  <span>·</span>
                  <span>·</span>
                </div>
                <div className={styles.miniRow}>
                  <span>·</span>
                  <span>·</span>
                  <span>·</span>
                  <span>·</span>
                  <span>·</span>
                </div>
                <div className={styles.miniRow}>
                  <span className={styles.miniMarked}>✓</span>
                  <span className={styles.miniMarked}>✓</span>
                  <span className={styles.miniMarked}>✓</span>
                  <span className={styles.miniMarked}>✓</span>
                  <span className={styles.miniMarked}>✓</span>
                </div>
              </div>
            </div>

            <div className={`${styles.patternRuleCard} ${styles.fullHouseCard}`}>
              <div className={styles.patternCardHeader}>
                <span className={styles.fullHousePill}>GRAND PRIZE</span>
                <h3>Full House</h3>
              </div>
              <p>
                All <strong>15 keys across all three rows</strong> marked. The ultimate achievement in
                Tech Tambola!
              </p>
              <div className={styles.miniGridPreview} aria-hidden="true">
                <div className={styles.miniRow}>
                  <span className={styles.miniMarkedFull}>✓</span>
                  <span className={styles.miniMarkedFull}>✓</span>
                  <span className={styles.miniMarkedFull}>✓</span>
                  <span className={styles.miniMarkedFull}>✓</span>
                  <span className={styles.miniMarkedFull}>✓</span>
                </div>
                <div className={styles.miniRow}>
                  <span className={styles.miniMarkedFull}>✓</span>
                  <span className={styles.miniMarkedFull}>✓</span>
                  <span className={styles.miniMarkedFull}>✓</span>
                  <span className={styles.miniMarkedFull}>✓</span>
                  <span className={styles.miniMarkedFull}>✓</span>
                </div>
                <div className={styles.miniRow}>
                  <span className={styles.miniMarkedFull}>✓</span>
                  <span className={styles.miniMarkedFull}>✓</span>
                  <span className={styles.miniMarkedFull}>✓</span>
                  <span className={styles.miniMarkedFull}>✓</span>
                  <span className={styles.miniMarkedFull}>✓</span>
                </div>
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className={styles.footer} role="contentinfo">
        <div className={styles.footerContainer}>
          <div className={styles.footerBrand}>
            <span className={styles.footerWordmark}>
              <strong>TECH TAMBOLA</strong> · MUACM 2026
            </span>
            <p className={styles.footerTagline}>Play Together. Mark Your Moment.</p>
          </div>

          <div className={styles.footerLinks}>
            <a href="#main-content">Back to Top ↑</a>
            <Link to="/login">Sign In</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
