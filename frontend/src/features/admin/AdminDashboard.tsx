import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createPlayRound, validatePlayBank } from '../../lib/api/play';
import { listAdminAudit } from '../../lib/api/adminOperations';
import { useNavigate } from 'react-router-dom';
import {
  fetchActiveGame,
  subscribeToGameSync,
  type SyncGameRecord,
} from '../../lib/gameSync';
import { formatAuditAction, formatAuditActor, formatAuditResource } from './auditFormatters';
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
  const [selectedRoundForAudit, setSelectedRoundForAudit] = useState<SyncGameRecord | null>(null);

  const roundAuditQuery = useQuery({
    queryKey: ['admin-round-audit', selectedRoundForAudit?.id],
    queryFn: ({ signal }) =>
      listAdminAudit({ roundId: selectedRoundForAudit!.id, limit: 100 }, signal),
    enabled: !!selectedRoundForAudit,
  });

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
                    className={styles.settingsBtn}
                    onClick={() => setSelectedRoundForAudit(game)}
                  >
                    ⚙ Settings
                  </button>
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

        {/* Round Settings & Audits Modal */}
        {selectedRoundForAudit && (
          <div
            className={styles.modalOverlay}
            onClick={() => setSelectedRoundForAudit(null)}
          >
            <div
              className={styles.modalContent}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <div>
                  <h2 className={styles.modalTitle}>
                    Settings & Audits — {selectedRoundForAudit.name}
                  </h2>
                  <p className={styles.modalSubtitle}>
                    Game #{selectedRoundForAudit.roundSequence} · Code: #{selectedRoundForAudit.code} · Created: {new Date(selectedRoundForAudit.createdAt).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  onClick={() => setSelectedRoundForAudit(null)}
                >
                  ✕ Close
                </button>
              </div>

              <div className={styles.modalBody}>
                <div className={styles.roundInfoBar}>
                  <div className={styles.roundInfoItem}>
                    <span className={styles.roundInfoLabel}>Round Status</span>
                    <span className={styles.roundInfoValue}>{selectedRoundForAudit.status}</span>
                  </div>
                  <div className={styles.roundInfoItem}>
                    <span className={styles.roundInfoLabel}>Game Code</span>
                    <span className={styles.roundInfoValue}>#{selectedRoundForAudit.code}</span>
                  </div>
                  <div className={styles.roundInfoItem}>
                    <span className={styles.roundInfoLabel}>Sequence</span>
                    <span className={styles.roundInfoValue}>Game #{selectedRoundForAudit.roundSequence}</span>
                  </div>
                </div>

                <div className={styles.auditSectionTitle}>
                  <span>Audits for this Round</span>
                  {roundAuditQuery.isFetching && <span style={{ fontSize: '12px', color: '#00e5ff' }}>Refreshing…</span>}
                </div>

                {roundAuditQuery.isLoading ? (
                  <p className={styles.emptyAuditMsg}>Loading round audits…</p>
                ) : roundAuditQuery.error ? (
                  <p className={styles.emptyAuditMsg}>Could not load audits for this round.</p>
                ) : roundAuditQuery.data?.items.length === 0 ? (
                  <p className={styles.emptyAuditMsg}>No audit records logged for this round yet.</p>
                ) : (
                  <div className={styles.auditTableWrap}>
                    <table className={styles.auditTable}>
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Actor</th>
                          <th>Action</th>
                          <th>Resource</th>
                          <th>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {roundAuditQuery.data?.items.map((record) => {
                          const actorInfo = formatAuditActor(record);
                          const resourceInfo = formatAuditResource(record);
                          return (
                            <tr key={record.id}>
                              <td>
                                <time dateTime={record.createdAt}>
                                  {new Intl.DateTimeFormat(undefined, {
                                    dateStyle: 'medium',
                                    timeStyle: 'short',
                                  }).format(new Date(record.createdAt))}
                                </time>
                              </td>
                              <td>
                                <span className={styles.auditActorEmail}>{actorInfo.primary}</span>
                                <span className={styles.auditActorRole}>{actorInfo.secondary}</span>
                              </td>
                              <td>
                                <span className={styles.auditActionText}>
                                  {formatAuditAction(record.action, record.metadata)}
                                </span>
                              </td>
                              <td>
                                <span className={styles.auditResourcePrimary}>
                                  {resourceInfo.primary}
                                </span>
                                <span className={styles.auditResourceSecondary}>
                                  {resourceInfo.secondary}
                                </span>
                              </td>
                              <td>
                                {record.metadata === null ? (
                                  '—'
                                ) : (
                                  <details>
                                    <summary style={{ cursor: 'pointer', color: '#00e5ff' }}>
                                      View metadata
                                    </summary>
                                    <pre style={{ margin: '8px 0 0 0', fontSize: '11px', maxHeight: '120px', overflowY: 'auto' }}>
                                      {JSON.stringify(record.metadata, null, 2)}
                                    </pre>
                                  </details>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
