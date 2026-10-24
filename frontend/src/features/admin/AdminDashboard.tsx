import { useState, useEffect } from 'react';
import { createPlayRound, validatePlayBank } from '../../lib/api/play';
import { useNavigate } from 'react-router-dom';
import {
  fetchActiveGame,
  subscribeToGameSync,
  type SyncGameRecord,
} from '../../lib/gameSync';
import styles from './AdminDashboard.module.css';

interface ImportedQuestion {
  number: number;
  term: string;
  clue: string;
  category?: string;
  codeSnippet?: string | null;
}

export function AdminDashboard() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [creationKey] = useState(() => crypto.randomUUID());
  const [games, setGames] = useState<SyncGameRecord[]>([]);

  // Excel Question Import state
  const [showImport, setShowImport] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<Awaited<ReturnType<typeof validatePlayBank>> | null>(null);
  const [importError, setImportError] = useState('');

  // Load and subscribe to game sync
  useEffect(() => {
    fetchActiveGame().then(({ games: all }) => setGames(all)).catch(() => setError('Could not load games. Check your connection.'));

    const unsubscribe = subscribeToGameSync(() => {
      fetchActiveGame().then(({ games: all }) => setGames(all)).catch(() => setError('Could not refresh games.'));
    });

    return unsubscribe;
  }, []);

  // Requirement: "+Create Game" generates fresh code, updates server, and redirects to /game (Point 3)
  async function handleCreateGame(customBank?: ImportedQuestion[]) {
    if (creating) return;
    setCreating(true);
    setError('');
    try {
      const game = await createPlayRound(creationKey, customBank);
      navigate(`/game?gameId=${game.id}`);
    } catch {
      setError('Could not create the game. Try again; the same request will not create a duplicate.');
    } finally {
      setCreating(false);
    }
  }

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setValidating(true);
    setImportError('');
    setValidationResult(null);
    try {
      const result = await validatePlayBank(file);
      setValidationResult(result);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not parse the selected spreadsheet file.');
    } finally {
      setValidating(false);
    }
  }

  // Open existing game: set as active and navigate to /game
  async function handleOpenGame(game: SyncGameRecord) {
    navigate(`/game?gameId=${game.id}`);
  }

  return (
    <main className={styles.page}>
      <div className={styles.dashboardCard}>
        {/* Top Header Row matching Image 1: Left: Games played till now-, Right: +Create Game & Import */}
        <div className={styles.headerRow}>
          <h1 className={styles.titleGamesPlayed}>Your games</h1>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={styles.createGameBtn}
              style={{
                background: 'rgba(0, 229, 255, 0.1)',
                border: '1px solid var(--color-primary-cyan, #00e5ff)',
                color: 'var(--color-primary-cyan, #00e5ff)',
              }}
              onClick={() => {
                setShowImport(!showImport);
                setImportError('');
                setValidationResult(null);
              }}
            >
              {showImport ? '✕ Close Import' : '📥 Import Excel Bank'}
            </button>
            <button
              type="button"
              className={styles.createGameBtn}
              onClick={() => handleCreateGame()}
              disabled={creating}
            >
              {creating ? 'Creating…' : '+ Create Game'}
            </button>
          </div>
        </div>

        {/* Excel Import Panel */}
        {showImport && (
          <section
            style={{
              background: 'rgba(10, 25, 45, 0.75)',
              border: '1px solid rgba(0, 229, 255, 0.3)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '24px',
            }}
            aria-label="Import Question Bank from Excel"
          >
            <h2 style={{ fontSize: '18px', margin: '0 0 10px 0', color: 'var(--color-primary-cyan, #00e5ff)' }}>
              Import Questions from Excel / Spreadsheet
            </h2>
            <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: 'var(--color-text-muted, #94a3b8)' }}>
              Select an Excel file (.xlsx, .xls) or CSV with question clues and answer terms. Tech Tambola will validate answer uniqueness, row formatting, and bank size.
            </p>

            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelected}
              disabled={validating || creating}
              style={{
                padding: '10px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px dashed rgba(0, 229, 255, 0.5)',
                borderRadius: '8px',
                color: '#fff',
                width: '100%',
                boxSizing: 'border-box',
                cursor: 'pointer',
              }}
            />

            {validating && <p style={{ color: '#00e5ff', marginTop: '12px' }}>Analyzing spreadsheet columns and rows…</p>}
            {importError && (
              <p style={{ color: '#ff5252', marginTop: '12px' }} role="alert">
                {importError}
              </p>
            )}

            {validationResult && (
              <div style={{ marginTop: '16px' }}>
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: validationResult.valid ? 'rgba(163, 255, 75, 0.1)' : 'rgba(255, 82, 82, 0.1)',
                    border: `1px solid ${validationResult.valid ? '#a3ff4b' : '#ff5252'}`,
                  }}
                >
                  <strong style={{ color: validationResult.valid ? '#a3ff4b' : '#ff5252' }}>
                    {validationResult.valid
                      ? `✓ Spreadsheet Validated (${validationResult.validRows} questions ready)`
                      : `✗ Validation Failed (${validationResult.errors.length} issue(s) detected)`}
                  </strong>
                  {validationResult.errors.length > 0 && (
                    <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px', color: '#ffb4b4', fontSize: '13px' }}>
                      {validationResult.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  )}
                  {validationResult.warnings.length > 0 && (
                    <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px', color: '#ffeb3b', fontSize: '13px' }}>
                      {validationResult.warnings.map((warn, i) => (
                        <li key={i}>{warn}</li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Preview first 5 rows */}
                {validationResult.questions.length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <h3 style={{ fontSize: '14px', margin: '0 0 8px 0', color: '#cbd5e1' }}>
                      Preview (First 5 of {validationResult.questions.length} questions):
                    </h3>
                    <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}>
                      {validationResult.questions.slice(0, 5).map((q) => (
                        <div
                          key={q.number}
                          style={{
                            padding: '8px 12px',
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                            fontSize: '13px',
                          }}
                        >
                          <strong style={{ color: '#00e5ff' }}>#{q.number} {q.term}</strong> ({q.category}): {q.clue}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {validationResult.valid && (
                  <button
                    type="button"
                    className={styles.createGameBtn}
                    style={{ marginTop: '16px', width: '100%' }}
                    onClick={() => handleCreateGame(validationResult.questions)}
                    disabled={creating}
                  >
                    {creating ? 'Creating Game…' : `+ Create Game with This ${validationResult.questions.length}-Question Bank`}
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        {error && <p role="alert">{error}</p>}
        {/* Saved rounds */}
        {games.length > 0 ? (
          <div className={styles.gamesList}>
            {games.map((game) => (
              <div key={game.id} className={styles.gameListItem}>
                <div className={styles.gameInfoCol}>
                  <div className={styles.gameTitleRow}>
                    <span className={styles.gameSeqBadge}>GAME #{game.roundSequence}</span>
                    <strong className={styles.gameName}>{game.name}</strong>
                  </div>
                  <div className={styles.gameMetaRow}>
                    <span className={styles.gameCodeBadge}>CODE: #{game.code}</span>
                    <span
                      className={`${styles.statusPill} ${
                        styles[`status_${game.status}`] || ''
                      }`}
                    >
                      {game.status}
                    </span>
                    <span className={styles.dateText}>
                      {new Date(game.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className={styles.gameActionCol}>
                  <button
                    type="button"
                    className={styles.manageGameBtn}
                    onClick={() => handleOpenGame(game)}
                  >
                    Open Game Control →
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Empty state matching Image 1 */
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>Click to create and start a game</p>
            <button
              type="button"
              className={styles.createGameBtnCenter}
              onClick={() => void handleCreateGame()}
              disabled={creating}
            >
              {creating ? 'Creating…' : '+ Create Game'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
