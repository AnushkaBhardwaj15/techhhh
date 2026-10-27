import { useEffect } from 'react';
import { BookOpenIcon, XIcon, LightbulbIcon } from './icons/Icons';
import styles from './GameRulesModal.module.css';

interface GameRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PATTERNS = [
  { name: 'Early 5', badge: 'ANY 5', desc: 'First participant to mark any 5 called terms anywhere on their ticket.' },
  { name: 'Four Corners', badge: '4 CORNERS', desc: 'The 4 outermost numbers/terms on your card (top-left, top-right, bottom-left, bottom-right).' },
  { name: 'Top Line', badge: 'ROW 1', desc: 'Complete all 5 populated terms on the top horizontal line.' },
  { name: 'Middle Line', badge: 'ROW 2', desc: 'Complete all 5 populated terms on the middle horizontal line.' },
  { name: 'Bottom Line', badge: 'ROW 3', desc: 'Complete all 5 populated terms on the bottom horizontal line.' },
  { name: 'Full House (1st)', badge: 'ALL 15', desc: 'First participant to complete all 15 technical terms on the entire card!' },
  { name: 'Second House', badge: 'RUNNER UP', desc: 'Second participant to complete all 15 technical terms on the entire card.' },
];

export function GameRulesModal({ isOpen, onClose }: GameRulesModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="rules-modal-title" onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <div className={styles.titleGroup}>
            <h2 id="rules-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BookOpenIcon width="18" height="18" aria-hidden="true" />
              <span>How to Play Tech Tombola</span>
            </h2>
            <p>Official Event Guide & Winning Pattern Rules</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close rules dialog">
            <XIcon width="16" height="16" aria-hidden="true" />
          </button>
        </header>

        <div className={styles.body}>
          {/* Critical Rule Highlight */}
          <div className={styles.ruleAlert}>
            <LightbulbIcon width="20" height="20" aria-hidden="true" style={{ flexShrink: 0 }} />
            <div>
              <strong>Critical Product Rule: Not a Quiz!</strong>
              <p>
                Questions are clues. The official answer key is revealed by the game host on the live screen.
                Participants find that key on their ticket and manually mark it.
              </p>
            </div>
          </div>

          {/* 3 Step Flow */}
          <section className={styles.stepsSection}>
            <h3>How Gameplay Works</h3>
            <div className={styles.stepGrid}>
              <div className={styles.stepCard}>
                <span className={styles.stepNumber}>STEP 1</span>
                <h4>Listen & Watch</h4>
                <p>The host reads out a clue and reveals the technical answer key on the live board.</p>
              </div>
              <div className={styles.stepCard}>
                <span className={styles.stepNumber}>STEP 2</span>
                <h4>Mark Your Card</h4>
                <p>Find the revealed key on your 3×9 card and tap the cell to mark it.</p>
              </div>
              <div className={styles.stepCard}>
                <span className={styles.stepNumber}>STEP 3</span>
                <h4>Claim Pattern</h4>
                <p>Once you complete a pattern, tap "Claim Pattern" to submit your win claim!</p>
              </div>
            </div>
          </section>

          {/* The 7 Winning Patterns */}
          <section className={styles.patternsSection}>
            <h3>The 7 Winning Prize Tiers</h3>
            <div className={styles.patternList}>
              {PATTERNS.map((p) => (
                <div key={p.name} className={styles.patternCard}>
                  <div className={styles.patternMeta}>
                    <span className={styles.patternBadge}>{p.badge}</span>
                    <strong>{p.name}</strong>
                  </div>
                  <p className={styles.patternDesc}>{p.desc}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.gotItBtn} onClick={onClose}>
            Got it, let's play!
          </button>
        </footer>
      </div>
    </div>
  );
}
