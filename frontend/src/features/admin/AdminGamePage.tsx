import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeSvg } from '../../components/QRCodeSvg';
import { ALL_90_QUESTIONS } from './questionsData';
import {
  fetchActiveGame,
  postGameStatus,
  postQuestionDraw,
  subscribeToGameSync,
  type SyncGameRecord,
} from '../../lib/gameSync';
import styles from './AdminGamePage.module.css';

export function AdminGamePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const gameIdParam = params.get('gameId');

  const [game, setGame] = useState<SyncGameRecord | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [drawnQuestions, setDrawnQuestions] = useState<number[]>(() => {
    try {
      const stored = localStorage.getItem(`tt_drawn_questions_${gameIdParam || 'active'}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Load and subscribe to game sync
  useEffect(() => {
    fetchActiveGame().then(({ game: active, games: all }) => {
      if (gameIdParam) {
        const found = all.find((g) => g.id === gameIdParam);
        if (found) {
          setGame(found);
          if (found.draws && found.draws.length > 0) {
            setDrawnQuestions(found.draws.map((d) => d.questionId));
          }
          return;
        }
      }
      setGame(active);
      if (active.draws && active.draws.length > 0) {
        setDrawnQuestions(active.draws.map((d) => d.questionId));
      }
    });

    const unsubscribe = subscribeToGameSync((updated) => {
      if (!gameIdParam || updated.id === gameIdParam) {
        setGame(updated);
        if (updated.draws && updated.draws.length > 0) {
          setDrawnQuestions(updated.draws.map((d) => d.questionId));
        }
      }
    });

    return unsubscribe;
  }, [gameIdParam]);

  // Handle Game Status Transitions
  async function handleStatusChange(newStatus: SyncGameRecord['status']) {
    if (!game) return;
    const updated = { ...game, status: newStatus };
    setGame(updated);
    await postGameStatus(game.id, newStatus);
  }

  // Draw / Call question - posts to backend so participant game receives the live question
  async function handleCallQuestion(questionId: number) {
    const q = ALL_90_QUESTIONS.find((item) => item.id === questionId);
    if (!q) return;

    if (!drawnQuestions.includes(questionId)) {
      const updated = [...drawnQuestions, questionId];
      setDrawnQuestions(updated);
      localStorage.setItem(`tt_drawn_questions_${game?.id || 'active'}`, JSON.stringify(updated));

      // Post to backend sync store so participant game receives it instantly
      await postQuestionDraw({
        questionId: q.id,
        prompt: q.prompt,
        answer: q.answer,
        key: q.key,
        domain: q.domain,
      });
    }
  }

  // Robust Search and Filter for Image 1:
  // If user types a search query (e.g. "dev"), search across text, prompt, key, answer, and domain.
  // If no matches in selected domain, search across all domains so the user is never stuck on an empty screen.
  const filteredQuestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return ALL_90_QUESTIONS.filter((q) => {
        return (
          selectedDomain === 'ALL' ||
          q.domain === selectedDomain ||
          (selectedDomain === 'CLOUD' && (q.domain === 'CLOUD' || q.domain === 'NETWORKING'))
        );
      });
    }

    // 1. Try matching within the selected domain
    const inDomain = ALL_90_QUESTIONS.filter((q) => {
      const matchesDomain =
        selectedDomain === 'ALL' ||
        q.domain === selectedDomain ||
        (selectedDomain === 'CLOUD' && (q.domain === 'CLOUD' || q.domain === 'NETWORKING'));
      const matchesText =
        q.prompt.toLowerCase().includes(query) ||
        q.answer.toLowerCase().includes(query) ||
        q.key.toLowerCase().includes(query) ||
        q.domain.toLowerCase().includes(query);
      return matchesDomain && matchesText;
    });

    if (inDomain.length > 0) {
      return inDomain;
    }

    // 2. If 0 matches in selected domain, search across all domains so user finds what they're looking for
    return ALL_90_QUESTIONS.filter((q) => {
      return (
        q.prompt.toLowerCase().includes(query) ||
        q.answer.toLowerCase().includes(query) ||
        q.key.toLowerCase().includes(query) ||
        q.domain.toLowerCase().includes(query)
      );
    });
  }, [selectedDomain, searchQuery]);

  const gameCode = game ? game.code : '8679DE';
  const joinUrl = `${window.location.origin}/lobby?code=${gameCode}`;

  return (
    <main className={styles.page}>
      <div className={styles.gameContainer}>
        {/* Top Navigation Row: ← Dashboard button (Point 3) */}
        <div className={styles.navRow}>
          <button
            type="button"
            className={styles.dashboardBackBtn}
            onClick={() => navigate('/admin')}
            title="Return to Admin Dashboard"
          >
            ← Dashboard
          </button>
          <span className={styles.gameTitleHeading}>
            {game?.name || 'Tech Tombola - Live Game Arena'}
          </span>
        </div>

        {/* MAIN GAME CONTAINER: IMAGE 2 */}
        <div className={styles.mainCard}>
          {/* CENTER BLOCK: GAME CODE + QR CODE */}
          <div className={styles.qrSection}>
            {/* Shows the game code */}
            <div className={styles.gameCodePill}>
              <span className={styles.gameCodeLabel}>GAME CODE:</span>
              <strong className={styles.gameCodeValue}>{gameCode}</strong>
              <button
                type="button"
                className={styles.copyBtn}
                onClick={() => navigator.clipboard.writeText(gameCode)}
                title="Copy Game Code"
              >
                📋 Copy
              </button>
            </div>

            {/* QR Code */}
            <div className={styles.qrFrame}>
              <QRCodeSvg
                value={joinUrl}
                size={220}
                title={`QR Code for Game ${gameCode}`}
              />
            </div>

            {/* Instruction annotation matching Image 2 */}
            <p className={styles.qrInstruction}>
              participant can either join by scanning the qr or by entering the game code in{' '}
              <span className={styles.lobbyTag}>/lobby</span>
            </p>

            {/* Host Quick Controls */}
            <div className={styles.controlsBar}>
              <div className={styles.statusGroup}>
                <span className={styles.statusLabel}>STATUS:</span>
                <span
                  className={`${styles.statusBadge} ${
                    styles[`status_${game?.status || 'READY'}`] || ''
                  }`}
                >
                  {game?.status || 'READY'}
                </span>
              </div>

              <div className={styles.actionsGroup}>
                {game?.status !== 'ACTIVE' ? (
                  <button
                    type="button"
                    className={styles.startBtn}
                    onClick={() => handleStatusChange('ACTIVE')}
                  >
                    ▶ START GAME
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.pauseBtn}
                    onClick={() => handleStatusChange('PAUSED')}
                  >
                    ⏸ PAUSE GAME
                  </button>
                )}

                {game?.status === 'ACTIVE' && (
                  <button
                    type="button"
                    className={styles.finishBtn}
                    onClick={() => handleStatusChange('COMPLETED')}
                  >
                    🏁 FINISH GAME
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* SECTION: QUESTION → (IMAGE 2 & IMAGE 3) */}
          <div className={styles.questionSection}>
            <div className={styles.questionHeader}>
              <div className={styles.questionTitleRow}>
                <h3 className={styles.questionTitle}>QUESTION →</h3>
                <span className={styles.questionBadge}>
                  ALL 90 QUESTIONS ASKED TO BE ASKED IN THAT ROUND
                </span>
              </div>

              {/* Domain Filter Pills and Search */}
              <div className={styles.filterBar}>
                <div className={styles.domainPills}>
                  {[
                    'ALL',
                    'FRONTEND',
                    'BACKEND',
                    'DATABASE',
                    'DEVOPS',
                    'CLOUD',
                    'SECURITY',
                    'SYSTEMS',
                  ].map((dom) => (
                    <button
                      key={dom}
                      type="button"
                      className={`${styles.domainPill} ${
                        selectedDomain === dom ? styles.domainPillActive : ''
                      }`}
                      onClick={() => setSelectedDomain(dom)}
                    >
                      {dom}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search 90 questions by keyword or key…"
                  className={styles.searchInput}
                />
              </div>
            </div>

            {/* LIST OF ALL 90 QUESTIONS: IMAGE 3 FORMAT */}
            <div className={styles.questionsList}>
              {filteredQuestions.map((q) => {
                const isDrawn = drawnQuestions.includes(q.id);
                return (
                  <div
                    key={q.id}
                    className={`${styles.questionItem} ${isDrawn ? styles.questionItemDrawn : ''}`}
                  >
                    {/* Top Row: Q: WHAT IS REACT USED TO BUILD? and [ FRONTEND ] */}
                    <div className={styles.itemHeader}>
                      <div className={styles.promptCol}>
                        <span className={styles.qIndex}>#{q.id}</span>
                        <h4 className={styles.qPrompt}>Q: {q.prompt}</h4>
                      </div>
                      <span className={styles.domainBadge}>{q.domain}</span>
                    </div>

                    {/* Bottom Row: components & ui functionalities. */}
                    <div className={styles.itemFooter}>
                      <p className={styles.qAnswer}>{q.answer}</p>
                      <div className={styles.qActionCol}>
                        <span className={styles.keyTag}>KEY: {q.key}</span>
                        <button
                          type="button"
                          className={`${styles.callBtn} ${isDrawn ? styles.callBtnDrawn : ''}`}
                          onClick={() => handleCallQuestion(q.id)}
                          disabled={isDrawn}
                        >
                          {isDrawn ? '✓ CALLED' : '🎯 CALL QUESTION'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
