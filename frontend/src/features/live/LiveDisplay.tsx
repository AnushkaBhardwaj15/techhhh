import { Link } from "react-router-dom";
import { usePlayState } from "../participant/usePlayState";
import styles from "./LiveDisplay.module.css";
import play from "../participant/ReferencePlay.module.css";

export function LiveDisplay() {
  const query = usePlayState("", true);
  const game = query.data;
  const latest = game?.draws.at(-1);

  return (
    <main className={styles.screen}>
      <header className={styles.topbar}>
        <div className={styles.brandGroup}>
          <p className={styles.brand}>
            TECH <span>TAMBOLA</span>
          </p>
          <span className={styles.gameName}>{game?.name ?? "Live Projector"}</span>
        </div>
        <div className={styles.statusGroup}>
          <span className={styles.liveBadge}>
            <span className={styles.pulseDot} />
            {game?.status ?? "WAITING"}
          </span>
        </div>
      </header>

      {query.isPending && (
        <div className={styles.statusNotice}>
          <p role="status">Loading the current game…</p>
        </div>
      )}

      {query.isError && (
        <div className={styles.statusNotice}>
          <p role="alert" className={play.warning}>
            Could not load the live game.{" "}
            <button onClick={() => void query.refetch()}>Retry</button>
          </p>
        </div>
      )}

      {!game && !query.isPending && !query.isError && (
        <section className={styles.emptyScreen}>
          <h1>Waiting for the admin to create a game.</h1>
          <p className={styles.emptySubtext}>
            The screen will automatically show clues once the game begins.
          </p>
          <Link className={play.back} to="/login">
            Sign in
          </Link>
        </section>
      )}

      {game && (
        <div className={styles.projectorBody}>
          {/* Main Question Display */}
          <section className={styles.questionSection}>
            <div className={styles.questionMeta}>
              <span className={styles.callBadge}>
                {latest ? `CALL #${latest.sequence}` : "WAITING FOR FIRST CLUE"}
              </span>
              {latest?.category && (
                <span className={styles.categoryBadge}>{latest.category}</span>
              )}
            </div>

            <h1 className={styles.questionHeading}>
              {latest?.prompt ?? "The first question will appear here shortly."}
            </h1>

            {latest?.codeSnippet && (
              <pre className={styles.codeSnippet}>{latest.codeSnippet}</pre>
            )}

            {/* Answer is ONLY revealed if admin has explicitly projected/revealed it */}
            {latest?.revealed && (
              <div className={styles.revealedAnswerBox}>
                <span className={styles.revealedLabel}>OFFICIAL ANSWER</span>
                <strong className={styles.revealedKey}>{latest.answer}</strong>
              </div>
            )}
          </section>

          {/* Lower Section: Recent Calls and Standings */}
          <section className={styles.lowerSection}>
            <div className={styles.recentSection}>
              <div className={styles.sectionHeader}>
                <h2>Recent calls</h2>
                <span className={styles.sectionCounter}>
                  {game.draws.length} called
                </span>
              </div>
              <div className={styles.recentList}>
                {game.draws.length === 0 ? (
                  <p className={styles.emptySubtext}>No calls yet.</p>
                ) : (
                  game.draws
                    .slice(-4)
                    .reverse()
                    .map((draw) => (
                      <div key={draw.id} className={styles.recentItem}>
                        <span className={styles.recentSeq}>#{draw.sequence}</span>
                        <div className={styles.recentBody}>
                          <p className={styles.recentPrompt}>{draw.prompt}</p>
                          {draw.revealed && (
                            <span className={styles.recentAnswerPill}>
                              {draw.answer}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>

            <div className={styles.standingsSection}>
              <div className={styles.sectionHeader}>
                <h2>Standings</h2>
                <span className={styles.sectionCounter}>Leaderboard</span>
              </div>
              <div className={styles.standingsList}>
                {game.standings.length === 0 ? (
                  <p className={styles.emptySubtext}>No prizes claimed yet.</p>
                ) : (
                  game.standings.slice(0, 4).map((row, index) => (
                    <div key={index} className={styles.standingItem}>
                      <span className={styles.standingRank}>#{index + 1}</span>
                      <strong className={styles.standingName}>{row.name}</strong>
                      <span className={styles.standingPoints}>
                        {row.points} POINTS
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      <footer className={styles.footer}>
        <span>TECH TAMBOLA · PROJECTOR VIEW</span>
        <span>NO SCROLL · LIVE SYNC</span>
      </footer>
    </main>
  );
}
