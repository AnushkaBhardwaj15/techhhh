import { useState } from 'react';
import styles from './SampleTicketDemo.module.css';

interface DemoCell {
  row: number;
  col: number;
  key: string;
}

const DEMO_CELLS: DemoCell[] = [
  // Row 0 (5 keys)
  { row: 0, col: 0, key: 'DOCKER' },
  { row: 0, col: 2, key: 'RUST' },
  { row: 0, col: 4, key: 'PYTHON' },
  { row: 0, col: 6, key: 'K8S' },
  { row: 0, col: 8, key: 'POSTGRES' },

  // Row 1 (5 keys)
  { row: 1, col: 1, key: 'LINUX' },
  { row: 1, col: 3, key: 'GIT' },
  { row: 1, col: 5, key: 'BUN' },
  { row: 1, col: 7, key: 'FASTIFY' },
  { row: 1, col: 8, key: 'GRAPHQL' },

  // Row 2 (5 keys)
  { row: 2, col: 0, key: 'REACT' },
  { row: 2, col: 2, key: 'REDIS' },
  { row: 2, col: 4, key: 'TYPESCRIPT' },
  { row: 2, col: 6, key: 'VITE' },
  { row: 2, col: 7, key: 'NEOVIM' },
];

const SIMULATED_DRAWS = [
  { question: 'High-performance all-in-one JS/TS runtime built with Zig and WebKit JSC', key: 'BUN' },
  { question: 'Distributed version control system created by Linus Torvalds', key: 'GIT' },
  { question: 'Memory-safe systems programming language sponsored by Mozilla', key: 'RUST' },
  { question: 'Fast and low-overhead web framework for Node & Bun', key: 'FASTIFY' },
  { question: 'Container engine standard that package applications into portable images', key: 'DOCKER' },
  { question: 'Relational database known for extensible types and SQL compliance', key: 'POSTGRES' },
];

export function SampleTicketDemo() {
  const [markedKeys, setMarkedKeys] = useState<Set<string>>(() => new Set(['DOCKER', 'POSTGRES']));
  const [drawIndex, setDrawIndex] = useState(0);
  const [activeDraw, setActiveDraw] = useState<(typeof SIMULATED_DRAWS)[0] | null>(null);

  const toggleMark = (key: string) => {
    setMarkedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSimulateDraw = () => {
    const nextDraw = SIMULATED_DRAWS[drawIndex % SIMULATED_DRAWS.length];
    setActiveDraw(nextDraw);
    setDrawIndex((prev) => prev + 1);
  };

  const resetTicket = () => {
    setMarkedKeys(new Set());
    setActiveDraw(null);
  };

  // Pattern detection logic
  const row0Count = DEMO_CELLS.filter((c) => c.row === 0 && markedKeys.has(c.key)).length;
  const row1Count = DEMO_CELLS.filter((c) => c.row === 1 && markedKeys.has(c.key)).length;
  const row2Count = DEMO_CELLS.filter((c) => c.row === 2 && markedKeys.has(c.key)).length;
  const totalMarked = markedKeys.size;

  const patterns = [
    { label: 'Early 5', achieved: totalMarked >= 5, desc: 'Any 5 marked cells' },
    { label: 'Top Line', achieved: row0Count === 5, desc: 'Row 1 complete (5/5)' },
    { label: 'Middle Line', achieved: row1Count === 5, desc: 'Row 2 complete (5/5)' },
    { label: 'Bottom Line', achieved: row2Count === 5, desc: 'Row 3 complete (5/5)' },
    { label: 'Full House', achieved: totalMarked === 15, desc: 'All 15 keys marked' },
  ];

  return (
    <div className={styles.wrapper}>
      {/* Simulation Controls Bar */}
      <div className={styles.controlsBar}>
        <div className={styles.controlsInfo}>
          <span className={styles.label}>INTERACTIVE DEMO</span>
          <p className={styles.instruction}>
            Tap cells to manually mark them, or simulate a live game draw:
          </p>
        </div>
        <div className={styles.actionButtons}>
          <button
            type="button"
            className={styles.simButton}
            onClick={handleSimulateDraw}
          >
            <span>▶ Simulate Next Clue</span>
          </button>
          <button
            type="button"
            className={styles.resetButton}
            onClick={resetTicket}
            title="Clear all marked cells"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Live Simulated Clue Display */}
      {activeDraw && (
        <div className={styles.clueCard} role="region" aria-label="Simulated clue announcement">
          <div className={styles.clueHeader}>
            <span className={styles.clueBadge}>SIMULATED DRAW</span>
            <span className={styles.revealedKeyBadge}>
              KEY: <strong>{activeDraw.key}</strong>
            </span>
          </div>
          <p className={styles.cluePrompt}>"{activeDraw.question}"</p>
          <p className={styles.clueHelp}>
            {markedKeys.has(activeDraw.key)
              ? `✓ '${activeDraw.key}' is already marked on your ticket!`
              : `Key revealed is '${activeDraw.key}'. Find it on the card below and tap it!`}
          </p>
        </div>
      )}

      {/* The 3x9 Ticket Card */}
      <div className={styles.ticketCard}>
        <div className={styles.ticketCardHeader}>
          <div>
            <span className={styles.cardKicker}>SAMPLE PARTICIPANT TICKET</span>
            <h3 className={styles.cardId}>#DEMO-TICKET-2026</h3>
          </div>
          <div className={styles.ticketScore}>
            <span className={styles.scoreText}>
              <strong>{totalMarked}</strong> / 15 MARKED
            </span>
          </div>
        </div>

        <div className={styles.gridContainer} tabIndex={0} role="region" aria-label="Interactive sample ticket grid">
          <table className={styles.grid}>
            <tbody>
              {Array.from({ length: 3 }, (_, row) => (
                <tr key={row}>
                  {Array.from({ length: 9 }, (_, col) => {
                    const cell = DEMO_CELLS.find((c) => c.row === row && c.col === col);
                    if (!cell) {
                      return (
                        <td key={col} className={styles.emptyCell}>
                          <span className={styles.emptyDot}>·</span>
                        </td>
                      );
                    }
                    const isMarked = markedKeys.has(cell.key);
                    const isHighlighted = activeDraw?.key === cell.key;

                    return (
                      <td
                        key={col}
                        className={`${styles.playableCell} ${isMarked ? styles.cellMarked : ''} ${
                          isHighlighted ? styles.cellHighlighted : ''
                        }`}
                        onClick={() => toggleMark(cell.key)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleMark(cell.key);
                          }
                        }}
                        aria-pressed={isMarked}
                        aria-label={`Row ${row + 1}, column ${col + 1}: ${cell.key}, ${
                          isMarked ? 'marked' : 'not marked'
                        }`}
                      >
                        <span className={styles.coord}>
                          R{row + 1}:C{col + 1}
                        </span>
                        <strong className={styles.keyText}>{cell.key}</strong>
                        <span className={styles.checkIcon}>{isMarked ? '✓' : '○'}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pattern Progress Chips */}
      <div className={styles.patternsBar} aria-label="Winning pattern achievement status">
        <span className={styles.patternsLabel}>PATTERN ELIGIBILITY:</span>
        <div className={styles.patternChips}>
          {patterns.map((p) => (
            <div
              key={p.label}
              className={`${styles.patternChip} ${p.achieved ? styles.patternAchieved : ''}`}
            >
              <span className={styles.patternIcon}>{p.achieved ? '★' : '○'}</span>
              <strong>{p.label}</strong>
              <span className={styles.patternDesc}>{p.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
