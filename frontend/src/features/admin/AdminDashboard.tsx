import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchActiveGame,
  postActiveGame,
  subscribeToGameSync,
  type SyncGameRecord,
} from '../../lib/gameSync';
import styles from './AdminDashboard.module.css';

function generateFreshGameCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function AdminDashboard() {
  const navigate = useNavigate();
  const [games, setGames] = useState<SyncGameRecord[]>([]);

  // Load and subscribe to game sync
  useEffect(() => {
    fetchActiveGame().then(({ games: all }) => {
      setGames(all);
    });

    const unsubscribe = subscribeToGameSync(() => {
      fetchActiveGame().then(({ games: all }) => {
        setGames(all);
      });
    });

    return unsubscribe;
  }, []);

  // Requirement: "+Create Game" generates fresh code, updates server, and redirects to /game (Point 3)
  async function handleCreateGame() {
    const freshCode = generateFreshGameCode();
    const nextSeq = games.length + 1;
    const newId = crypto.randomUUID();

    const newGame: SyncGameRecord = {
      id: newId,
      name: `Tech Tombola - Game #${nextSeq}`,
      code: freshCode,
      status: 'READY',
      createdAt: new Date().toISOString(),
      roundSequence: nextSeq,
    };

    // Post to shared store (backend + broadcast + localStorage)
    await postActiveGame(newGame);

    // Change whole page to /game as requested in Point 3
    navigate(`/game?gameId=${newId}`);
  }

  // Open existing game: set as active and navigate to /game
  async function handleOpenGame(game: SyncGameRecord) {
    await postActiveGame(game);
    navigate(`/game?gameId=${game.id}`);
  }

  return (
    <main className={styles.page}>
      <div className={styles.dashboardCard}>
        {/* Top Header Row matching Image 1: Left: Games played till now-, Right: +Create Game */}
        <div className={styles.headerRow}>
          <h2 className={styles.titleGamesPlayed}>Games played till now-</h2>
          <button
            type="button"
            className={styles.createGameBtn}
            onClick={handleCreateGame}
          >
            + Create Game
          </button>
        </div>

        {/* List of games played till now */}
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
              onClick={handleCreateGame}
            >
              + Create Game
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
