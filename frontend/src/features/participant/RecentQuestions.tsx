import type { PlayState } from '../../types/play';
import styles from './RecentQuestions.module.css';

export type HistoryQuestion = Pick<PlayState['draws'][number], 'id' | 'sequence' | 'prompt' | 'answer' | 'revealed' | 'codeSnippet' | 'revealBatchId'>;

export function RecentQuestions({ draws }: { draws: readonly HistoryQuestion[] }) {
  const latest = [...draws].sort((a, b) => b.sequence - a.sequence)[0];
  const previous = latest?.revealed && latest.answer
    ? draws.filter(draw => draw.revealed && draw.answer && (latest.revealBatchId ? draw.revealBatchId === latest.revealBatchId : true)).sort((a, b) => b.sequence - a.sequence)
    : [];
  return <details className={styles.history}>
    <summary>Previous questions &amp; answers ({previous.length})</summary>
    <p>Answers from the current reveal batch appear here. This clears when the next question is called.</p>
    {previous.length ? <ol className={styles.list}>
      {previous.map(draw => <li key={draw.id}>
        <span className={styles.number}>Question {draw.sequence}</span>
        <p className={styles.prompt}>{draw.prompt}</p>
        {draw.codeSnippet && <pre>{draw.codeSnippet}</pre>}
        <p className={styles.answer}>Answer: <strong>{draw.answer}</strong></p>
      </li>)}
    </ol> : <p>No answers in this batch yet. They’ll appear when the host reveals this batch.</p>}
  </details>;
}
