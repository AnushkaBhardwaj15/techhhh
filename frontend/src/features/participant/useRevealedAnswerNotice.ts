import { useEffect, useRef } from 'react';
import { notify, type Notice } from '../../lib/notifications';
import type { HistoryQuestion } from './RecentQuestions';

export function useRevealedAnswerNotice(gameId: string, draws: readonly HistoryQuestion[], onNotify: (notice: Notice) => void = notify) {
  const previous = useRef<{ gameId: string; ids: Set<string> } | null>(null);
  useEffect(() => {
    const revealed = draws.filter(draw => draw.revealed && draw.answer);
    const last = previous.current;
    previous.current = { gameId, ids: new Set(revealed.map(draw => draw.id)) };
    if (!last || last.gameId !== gameId) return;
    const sequences = revealed.filter(draw => !last.ids.has(draw.id)).map(draw => draw.sequence).sort((a, b) => a - b);
    if (!sequences.length) return;
    const consecutive = sequences.every((sequence, index) => sequence === sequences[0]! + index);
    const numbers = sequences.length > 1 && consecutive ? `${sequences[0]}–${sequences.at(-1)}` : sequences.join(', ');
    onNotify({ title: 'Answers revealed', tone: 'info', message: `${sequences.length === 1 ? 'Answer for question' : 'Answers for questions'} ${numbers} ${sequences.length === 1 ? 'is' : 'are'} revealed. Scroll down to Previous questions & answers to view them.` });
  }, [gameId, draws, onNotify]);
}
