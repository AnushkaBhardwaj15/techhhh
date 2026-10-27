import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { deletePlayGame, createPlayRound, validatePlayBank, commandPlayRound, broadcastPlayRound } from '../../lib/api/play';
import { recoverRound } from '../../lib/api/adminOperations';
import { listAdminAudit } from '../../lib/api/adminOperations';
import type { AuthenticatedUser } from '../../types/auth';
import { useAdminDashboard } from './useAdminDashboard';
import {
  fetchActiveGame,
  subscribeToGameSync,
  type SyncGameRecord,
} from '../../lib/gameSync';
import { formatAuditAction, formatAuditActor, formatAuditResource } from './auditFormatters';
import { XIcon, FileSpreadsheetIcon, MegaphoneIcon, SettingsIcon } from '../../components/icons/Icons';
import styles from './AdminDashboard.module.css';

interface ImportedQuestion {
  number: number;
  term: string;
  clue: string;
  category?: string;
  codeSnippet?: string | null;
}

function statusName(value: string) {
  return value.toLowerCase().replaceAll('_', ' ');
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.metric}>
      <dt>{label}</dt>
      <dd>{value.toLocaleString()}</dd>
    </div>
  );
}

export function AdminDashboard() {
  const navigate = useNavigate();
  const user = useOutletContext<AuthenticatedUser | undefined>();
  const dashboard = useAdminDashboard(user?.id ?? 'admin');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [games, setGames] = useState<SyncGameRecord[]>([]);
  const [commandingId, setCommandingId] = useState<string | null>(null);
  const [broadcastingId, setBroadcastingId] = useState<string | null>(null);
  const [selectedRoundForAudit, setSelectedRoundForAudit] = useState<SyncGameRecord | null>(null);

  const roundAuditQuery = useQuery({
    queryKey: ['admin-round-audit', selectedRoundForAudit?.id],
    queryFn: ({ signal }) =>
      listAdminAudit({ roundId: selectedRoundForAudit!.id, limit: 100 }, signal),
    enabled: !!selectedRoundForAudit,
  });

  async function handleToggleBroadcast(gameId: string, currentStatus: boolean) {
    if (broadcastingId) return;
    setBroadcastingId(gameId);
    setError('');
    try {
      await broadcastPlayRound(gameId, !currentStatus);
      const { games: all } = await fetchActiveGame();
      setGames(all);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update lobby broadcast status.');
    } finally {
      setBroadcastingId(null);
    }
  }

  async function handleGameCommand(gameId: string, action: 'start' | 'pause' | 'resume') {
    if (commandingId) return;
    setCommandingId(gameId);
    setError('');
    try {
      await commandPlayRound(gameId, { action }, crypto.randomUUID());
      const { games: all } = await fetchActiveGame();
      setGames(all);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update event state.');
    } finally {
      setCommandingId(null);
    }
  }

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
  async function handleDeleteGame(id: string) {
    if (!window.confirm('Delete this game? Any running game will end. Historical results will be retained.')) return;
    setCommandingId(id); setError('');
    try { await deletePlayGame(id); setGames((await fetchActiveGame()).games); setSelectedRoundForAudit(null); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not delete game.'); }
    finally { setCommandingId(null); }
  }
  async function handleRecoverGame(id: string) {
    setCommandingId(id); setError('');
    try { await recoverRound(id); setGames((await fetchActiveGame()).games); setSelectedRoundForAudit(null); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not recover game.'); }
    finally { setCommandingId(null); }
  }
  async function handleCreateGame(customBank?: ImportedQuestion[]) {
    if (creating) return;
    setCreating(true);
    setError('');
    try {
      const key = crypto.randomUUID();
      const game = await createPlayRound(key, customBank);
      navigate(`/game?gameId=${game.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the game. Try again.');
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
      {/* OPERATIONS OVERVIEW DASHBOARD - Matching Image 1 */}
      <div className={styles.dashboardCard} style={{ marginBottom: '24px' }}>
        <p className={styles.eyebrow}>HOST / DASHBOARD</p>
        <header className={styles.heading}>
          <h1 className={styles.titleGamesPlayed} style={{ margin: 0 }}>Game overview</h1>
          <p className={styles.updated}>
            {dashboard.dataUpdatedAt
              ? `Updated ${new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(dashboard.dataUpdatedAt)}`
              : 'Live operational snapshot'}
          </p>
        </header>

        {dashboard.data && (
          <section aria-label="Operational metrics">
            {dashboard.data.recoveryRequired && (
              <p className={styles.recovery} role="alert">
                This game was interrupted. Recover it from Settings to continue.
              </p>
            )}
            <div className={styles.summary} aria-label="Current game">
              <article className={styles.event}>
                <h2>CURRENT GAME</h2>
                <p className={styles.eventName}>{dashboard.data.round?.name ?? 'No current game'}</p>
                {dashboard.data.round && <div className={styles.eventMeta}><span className={styles.status}>{statusName(dashboard.data.round.status)}</span><button type="button" onClick={() => navigate(`/game?gameId=${dashboard.data.round!.id}`)}>Open Game</button></div>}
              </article>
            </div>
            <dl className={styles.metrics} aria-label="Operational metrics">
              <Metric label="Game participants" value={dashboard.data.participants} />
              <Metric label="Live players" value={dashboard.data.connectedConnections} />
              <Metric label="Draw count" value={dashboard.data.drawCount} />
              <Metric label="Pending claims" value={dashboard.data.pendingClaims} />
              <Metric label="Verified winners" value={dashboard.data.verifiedWinners} />
            </dl>
          </section>
        )}
      </div>

      {/* Live Event Quick Controls Banner */}
      {(() => {
        const liveGame = games.find((g) => g.status === 'ACTIVE' || g.status === 'PAUSED');
        if (!liveGame) return null;
        const isPaused = liveGame.status === 'PAUSED';
        return (
          <div
            style={{
              background: 'var(--color-sandstone, #DCD0BD)',
              border: '2px solid #302820',
              borderColor: 'var(--color-espresso, #302820)',
              borderRadius: 'var(--radius-sm, 4px)',
              boxShadow: '3px 3px 0 var(--color-espresso, #302820)',
              padding: '16px 20px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              <span
                style={{
                  display: 'inline-block',
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-xs, 2px)',
                  fontSize: '11px',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  background: isPaused ? '#946824' : 'var(--color-oxblood, #8C4545)',
                  color: '#FAF7F0',
                  marginBottom: '4px',
                }}
              >
                {isPaused ? '⏸ GAME PAUSED' : '● LIVE GAME IN PROGRESS'}
              </span>
              <h2 style={{ margin: '2px 0 0 0', fontSize: '18px', color: 'var(--color-espresso, #302820)' }}>
                {liveGame.name} (Code: {liveGame.code})
              </h2>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {isPaused ? (
                <button
                  type="button"
                  className={styles.createGameBtn}
                  style={{ background: 'var(--color-oxblood, #8C4545)', color: '#FAF7F0', fontWeight: 700 }}
                  onClick={() => void handleGameCommand(liveGame.id, 'resume')}
                  disabled={commandingId === liveGame.id}
                >
                  ▶ Resume Game
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.createGameBtn}
                  style={{ background: '#946824', color: '#FAF7F0', fontWeight: 700 }}
                  onClick={() => void handleGameCommand(liveGame.id, 'pause')}
                  disabled={commandingId === liveGame.id}
                >
                  ⏸ Pause Game
                </button>
              )}
              <button
                type="button"
                className={styles.createGameBtn}
                onClick={() => handleOpenGame(liveGame)}
              >
                Open game →
              </button>
            </div>
          </div>
        );
      })()}

      <div className={styles.dashboardCard}>
        {/* Top Header Row matching Image 1: Left: Games played till now-, Right: +Create Game & Import */}
        <div className={styles.headerRow}>
          <h2 className={styles.titleGamesPlayed} style={{ margin: 0, fontSize: '22px' }}>Your games</h2>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={styles.createGameBtn}
              style={{
                background: 'var(--color-paper, #FAF7F0)',
                border: '1.5px solid #302820',
                borderColor: 'var(--color-espresso, #302820)',
                color: 'var(--color-espresso, #302820)',
              }}
              onClick={() => {
                setShowImport(!showImport);
                setImportError('');
                setValidationResult(null);
              }}
            >
              {showImport ? (
                <>
                  <XIcon width="13" height="13" aria-hidden="true" style={{ verticalAlign: '-1px', marginRight: '4px' }} />
                  Close Import
                </>
              ) : (
                <>
                  <FileSpreadsheetIcon width="13" height="13" aria-hidden="true" style={{ verticalAlign: '-1px', marginRight: '4px' }} />
                  Import question bank
                </>
              )}
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
            <h2 style={{ fontSize: '18px', margin: '0 0 10px 0', color: 'var(--color-espresso, #302820)' }}>
              Import Questions from Excel / Spreadsheet
            </h2>
            <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: 'var(--color-text-secondary, #62584C)' }}>
              Select an Excel file (.xlsx, .xls) or CSV with question clues and answer terms. Tech Tambola will validate answer uniqueness, row formatting, and bank size.
            </p>

            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelected}
              disabled={validating || creating}
              style={{
                padding: '10px',
                background: 'var(--color-paper, #FAF7F0)',
                border: '1.5px dashed var(--color-espresso, #302820)',
                borderRadius: 'var(--radius-xs, 2px)',
                color: 'var(--color-espresso, #302820)',
                width: '100%',
                boxSizing: 'border-box',
                cursor: 'pointer',
              }}
            />

            {validating && <p style={{ color: 'var(--color-oxblood, #8C4545)', marginTop: '12px' }}>Analyzing spreadsheet columns and rows…</p>}
            {importError && (
              <p style={{ color: '#8C4545', marginTop: '12px' }} role="alert">
                {importError}
              </p>
            )}

            {validationResult && (
              <div style={{ marginTop: '16px' }}>
                <div
                  style={{
                    padding: '12px',
                    borderRadius: 'var(--radius-xs, 2px)',
                    background: validationResult.valid ? '#E2ECD6' : '#F7E6E6',
                    border: `1.5px solid ${validationResult.valid ? '#3D6B4F' : '#8C4545'}`,
                  }}
                >
                  <strong style={{ color: validationResult.valid ? '#3D6B4F' : '#8C4545' }}>
                    {validationResult.valid
                      ? `✓ Spreadsheet Validated (${validationResult.validRows} questions ready)`
                      : `✗ Validation Failed (${validationResult.errors.length} issue(s) detected)`}
                  </strong>
                  {validationResult.errors.length > 0 && (
                    <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px', color: '#8C4545', fontSize: '13px' }}>
                      {validationResult.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  )}
                  {validationResult.warnings.length > 0 && (
                    <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px', color: '#946824', fontSize: '13px' }}>
                      {validationResult.warnings.map((warn, i) => (
                        <li key={i}>{warn}</li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Preview first 5 rows */}
                {validationResult.questions.length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <h3 style={{ fontSize: '14px', margin: '0 0 8px 0', color: 'var(--color-espresso, #302820)' }}>
                      Preview (First 5 of {validationResult.questions.length} questions):
                    </h3>
                    <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--color-border-muted, #BFB29F)', borderRadius: 'var(--radius-xs, 2px)', background: 'var(--color-paper, #FAF7F0)' }}>
                      {validationResult.questions.slice(0, 5).map((q) => (
                        <div
                          key={q.number}
                          style={{
                            padding: '8px 12px',
                            borderBottom: '1px solid var(--color-border-subtle, #D2C6B5)',
                            fontSize: '13px',
                            color: 'var(--color-espresso, #302820)',
                          }}
                        >
                          <strong style={{ color: 'var(--color-oxblood, #8C4545)' }}>#{q.number} {q.term}</strong> ({q.category}): {q.clue}
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

        {!dashboard.data && error && <p role="alert">{error}</p>}
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
                    {game.isBroadcast && (
                      <span
                        style={{
                          background: 'var(--retro-orange, #EE640F)',
                          color: '#FFFFFF',
                          fontFamily: 'var(--mono)',
                          fontSize: '11px',
                          fontWeight: 900,
                          padding: '3px 8px',
                          border: '1.5px solid var(--retro-ink, #18130F)',
                          boxShadow: '1.5px 1.5px 0 var(--retro-ink, #18130F)',
                          borderRadius: '2px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                        }}
                      >
                        <MegaphoneIcon width="12" height="12" aria-hidden="true" />
                        SHOWN IN LOBBY
                      </span>
                    )}
                    <span className={styles.dateText}>
                      {new Date(game.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className={styles.gameActionCol}>
                  <button
                    type="button"
                    className={styles.settingsBtn}
                    style={{
                      background: game.isBroadcast ? 'var(--retro-orange, #EE640F)' : '#FFFFFF',
                      color: game.isBroadcast ? '#FFFFFF' : 'var(--retro-ink, #18130F)',
                      fontWeight: 800,
                    }}
                    onClick={() => void handleToggleBroadcast(game.id, !!game.isBroadcast)}
                    disabled={broadcastingId === game.id}
                    title="Toggle whether participants see this game and quick-join directly in the lobby"
                  >
                    {broadcastingId === game.id ? 'Updating…' : game.isBroadcast ? 'Visible in lobby' : 'Hidden in lobby'}
                  </button>
                  {game.status === 'READY' && (
                    <button
                      type="button"
                      className={styles.manageGameBtn}
                      style={{ background: 'var(--lime, #a3ff4b)', color: 'var(--color-espresso, #302820)', fontWeight: 700 }}
                      onClick={() => void handleGameCommand(game.id, 'start')}
                      disabled={commandingId === game.id}
                    >
                      {commandingId === game.id ? 'Starting…' : '▶ Start Game'}
                    </button>
                  )}
                  {game.status === 'ACTIVE' && (
                    <button
                      type="button"
                      className={styles.manageGameBtn}
                      style={{ background: '#ffb74d', color: 'var(--color-espresso, #302820)', fontWeight: 700 }}
                      onClick={() => void handleGameCommand(game.id, 'pause')}
                      disabled={commandingId === game.id}
                    >
                      {commandingId === game.id ? 'Pausing…' : '⏸ Pause Game'}
                    </button>
                  )}
                  {game.status === 'PAUSED' && (
                    <button
                      type="button"
                      className={styles.manageGameBtn}
                      style={{ background: 'var(--color-oxblood, #8C4545)', color: '#FAF7F0', fontWeight: 700 }}
                      onClick={() => void handleGameCommand(game.id, 'resume')}
                      disabled={commandingId === game.id}
                    >
                      {commandingId === game.id ? 'Resuming…' : '▶ Resume Game'}
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.settingsBtn}
                    onClick={() => setSelectedRoundForAudit(game)}
                  >
                    <SettingsIcon width="13" height="13" aria-hidden="true" style={{ verticalAlign: '-1px', marginRight: '4px' }} />
                    Settings
                  </button>
                  <button
                    type="button"
                    className={styles.manageGameBtn}
                    onClick={() => handleOpenGame(game)}
                  >
                    Open game →
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
                  <XIcon width="13" height="13" aria-hidden="true" style={{ verticalAlign: '-1px', marginRight: '4px' }} />
                  Close
                </button>
              </div>

              <div className={styles.modalBody}>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
                  {selectedRoundForAudit.status === 'RECOVERY_REQUIRED' && <button type="button" className={styles.manageGameBtn} disabled={commandingId !== null} onClick={() => void handleRecoverGame(selectedRoundForAudit.id)}>{commandingId === selectedRoundForAudit.id ? 'Recovering…' : 'Recover Game'}</button>}
                  <button type="button" className={styles.settingsBtn} disabled={commandingId !== null} onClick={() => void handleDeleteGame(selectedRoundForAudit.id)}>{commandingId === selectedRoundForAudit.id ? 'Processing…' : 'Delete Game'}</button>
                </div>
                <div className={styles.roundInfoBar}>
                  <div className={styles.roundInfoItem}>
                    <span className={styles.roundInfoLabel}>Game Status</span>
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
                  <span>Game audit history</span>
                  {roundAuditQuery.isFetching && <span style={{ fontSize: '12px', color: 'var(--retro-orange, #EE640F)' }}>Refreshing…</span>}
                </div>

                {roundAuditQuery.isLoading ? (
                  <p className={styles.emptyAuditMsg}>Loading game audits…</p>
                ) : roundAuditQuery.error ? (
                  <p className={styles.emptyAuditMsg}>Could not load audits for this game.</p>
                ) : roundAuditQuery.data?.items.length === 0 ? (
                  <p className={styles.emptyAuditMsg}>No audit records logged for this game yet.</p>
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
                                    <summary style={{ cursor: 'pointer', color: 'var(--retro-orange, #EE640F)' }}>
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
