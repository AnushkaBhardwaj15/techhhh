import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { getAdminEvent } from '../../lib/api/adminEvents';
import { getAdminRound, listAdminRounds } from '../../lib/api/adminRounds';
import { createAdminKey, createAdminQuestion, deleteAdminQuestion, listAdminKeys, listAdminQuestions, updateAdminKey, updateAdminQuestion } from '../../lib/api/adminQuestions';
import type { AuthenticatedUser } from '../../types/auth';
import styles from './AdminQuestions.module.css';

const PAGE_SIZE = 20;
const eventKey = (userId: string, eventId: string) => ['admin-events', userId, 'detail', eventId] as const;
const roundsKey = (userId: string, eventId: string) => ['admin-rounds', userId, eventId, 'list', 1] as const;
const roundKey = (userId: string, eventId: string, roundId: string) => ['admin-rounds', userId, eventId, 'detail', roundId] as const;
const keysKey = (userId: string, eventId: string, page: number) => ['admin-keys', userId, eventId, page] as const;
const questionsKey = (userId: string, eventId: string, roundId: string, page: number) => ['admin-questions', userId, eventId, roundId, page] as const;

function messageFor(error: unknown, fallback: string) { return error instanceof ApiError ? error.message : fallback; }

export function AdminQuestions() {
  const user = useOutletContext<AuthenticatedUser>();
  const [params, setParams] = useSearchParams();
  const eventId = params.get('eventId') ?? '';
  const roundId = params.get('roundId') ?? '';
  const keyPage = Math.max(1, Number(params.get('keyPage')) || 1);
  const questionPage = Math.max(1, Number(params.get('questionPage')) || 1);
  const keySearch = params.get('keySearch')?.trim() ?? '';
  const questionSearch = params.get('questionSearch')?.trim() ?? '';
  const keyUsedParam = params.get('keyUsed');
  const questionUsedParam = params.get('questionUsed');
  const keyUsed = keyUsedParam === 'true' ? true : keyUsedParam === 'false' ? false : undefined;
  const questionUsed = questionUsedParam === 'true' ? true : questionUsedParam === 'false' ? false : undefined;
  const latestParams = useRef(params);
  latestParams.current = params;
  const queryClient = useQueryClient();
  const [keySearchInput, setKeySearchInput] = useState(keySearch);
  const [questionSearchInput, setQuestionSearchInput] = useState(questionSearch);
  const [keyUsedInput, setKeyUsedInput] = useState(keyUsedParam === 'true' || keyUsedParam === 'false' ? keyUsedParam : '');
  const [questionUsedInput, setQuestionUsedInput] = useState(questionUsedParam === 'true' || questionUsedParam === 'false' ? questionUsedParam : '');
  const [keyForm, setKeyForm] = useState('');
  const [keyFormEventId, setKeyFormEventId] = useState('');
  const [questionForm, setQuestionForm] = useState({ keyId: '', questionText: '' });
  const [creatingKey, setCreatingKey] = useState(false);
  const [editingKey, setEditingKey] = useState(false);
  const [creatingQuestion, setCreatingQuestion] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(false);
  const [selectedKeyId, setSelectedKeyId] = useState('');
  const [selectedQuestionId, setSelectedQuestionId] = useState('');
  const [message, setMessage] = useState('');

  const event = useQuery({ queryKey: eventKey(user.id, eventId), queryFn: ({ signal }) => getAdminEvent(eventId, signal), enabled: Boolean(eventId) });
  const rounds = useQuery({ queryKey: roundsKey(user.id, eventId), queryFn: ({ signal }) => listAdminRounds({ eventId, page: 1, limit: 100, signal }), enabled: Boolean(eventId) });
  const round = useQuery({ queryKey: roundKey(user.id, eventId, roundId), queryFn: ({ signal }) => getAdminRound(roundId, signal), enabled: Boolean(eventId && roundId) });
  const keys = useQuery({ queryKey: [...keysKey(user.id, eventId, keyPage), keySearch, keyUsedParam], queryFn: ({ signal }) => listAdminKeys({ eventId, page: keyPage, limit: PAGE_SIZE, search: keySearch || undefined, used: keyUsed, signal }), enabled: Boolean(eventId) });
  const questions = useQuery({ queryKey: [...questionsKey(user.id, eventId, roundId, questionPage), questionSearch, questionUsedParam], queryFn: ({ signal }) => listAdminQuestions({ roundId, page: questionPage, limit: PAGE_SIZE, search: questionSearch || undefined, used: questionUsed, signal }), enabled: Boolean(eventId && roundId && round.data?.eventId === eventId) });

  useEffect(() => {
    setSelectedKeyId(''); setCreatingKey(false); setEditingKey(false); setKeyForm(''); setKeyFormEventId('');
  }, [eventId]);

  useEffect(() => {
    setSelectedQuestionId(''); setCreatingQuestion(false); setEditingQuestion(false);
    setQuestionForm({ keyId: '', questionText: '' }); setMessage('');
  }, [eventId, roundId]);

  useEffect(() => { setKeySearchInput(keySearch); setKeyUsedInput(keyUsedParam === 'true' || keyUsedParam === 'false' ? keyUsedParam : ''); }, [keySearch, keyUsedParam]);
  useEffect(() => { setQuestionSearchInput(questionSearch); setQuestionUsedInput(questionUsedParam === 'true' || questionUsedParam === 'false' ? questionUsedParam : ''); }, [questionSearch, questionUsedParam]);

  const createKey = useMutation({
    mutationFn: (input: { eventId: string; value: string }) => createAdminKey(input),
    onSuccess: async (saved, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['admin-keys', user.id, variables.eventId] });
      if (latestParams.current.get('eventId') === variables.eventId) { setKeyForm(''); setCreatingKey(false); setMessage(`Key ${saved.value} saved.`); }
    },
    onError: async (error, variables) => { if (latestParams.current.get('eventId') === variables.eventId) setMessage(messageFor(error, 'Could not create Key. The latest list was requested before retrying.')); await queryClient.invalidateQueries({ queryKey: ['admin-keys', user.id, variables.eventId] }); },
  });
  const editKey = useMutation({
    mutationFn: ({ id, value }: { eventId: string; id: string; value: string }) => updateAdminKey(id, { value }),
    onSuccess: async (_saved, variables) => { await queryClient.invalidateQueries({ queryKey: ['admin-keys', user.id, variables.eventId] }); if (latestParams.current.get('eventId') === variables.eventId) { setEditingKey(false); setMessage('Key changes saved.'); } },
    onError: async (error, variables) => { if (latestParams.current.get('eventId') === variables.eventId) setMessage(messageFor(error, 'Could not update this Key. Refresh the list and review server feedback.')); await queryClient.invalidateQueries({ queryKey: ['admin-keys', user.id, variables.eventId] }); },
  });
  const createQuestion = useMutation({
    mutationFn: (input: { eventId: string; roundId: string; keyId: string; questionText: string }) => createAdminQuestion({ roundId: input.roundId, keyId: input.keyId, questionText: input.questionText }),
    onSuccess: async (saved, variables) => { await queryClient.invalidateQueries({ queryKey: ['admin-questions', user.id, variables.eventId, variables.roundId] }); if (latestParams.current.get('eventId') === variables.eventId && latestParams.current.get('roundId') === saved.roundId) { setCreatingQuestion(false); setSelectedQuestionId(saved.id); setMessage('Question association saved.'); } },
    onError: async (error, variables) => { if (latestParams.current.get('eventId') === variables.eventId && latestParams.current.get('roundId') === variables.roundId) setMessage(messageFor(error, 'Could not associate this Question. Refresh the list before retrying.')); await queryClient.invalidateQueries({ queryKey: ['admin-questions', user.id, variables.eventId, variables.roundId] }); },
  });
  const editQuestion = useMutation({
    mutationFn: ({ id, questionText }: { eventId: string; roundId: string; id: string; questionText: string }) => updateAdminQuestion(id, { questionText }),
    onSuccess: async (_saved, variables) => { await queryClient.invalidateQueries({ queryKey: ['admin-questions', user.id, variables.eventId, variables.roundId] }); if (latestParams.current.get('eventId') === variables.eventId && latestParams.current.get('roundId') === variables.roundId) { setEditingQuestion(false); setMessage('Question changes saved.'); } },
    onError: async (error, variables) => { if (latestParams.current.get('eventId') === variables.eventId && latestParams.current.get('roundId') === variables.roundId) setMessage(messageFor(error, 'Could not update this Question. Refresh the list and review server feedback.')); await queryClient.invalidateQueries({ queryKey: ['admin-questions', user.id, variables.eventId, variables.roundId] }); },
  });
  const removeQuestion = useMutation({
    mutationFn: ({ id }: { eventId: string; roundId: string; id: string }) => deleteAdminQuestion(id),
    onSuccess: async (_saved, variables) => { await queryClient.invalidateQueries({ queryKey: ['admin-questions', user.id, variables.eventId, variables.roundId] }); if (latestParams.current.get('eventId') === variables.eventId && latestParams.current.get('roundId') === variables.roundId) { setSelectedQuestionId(''); setEditingQuestion(false); setMessage('Question removed.'); } },
    onError: async (error, variables) => { if (latestParams.current.get('eventId') === variables.eventId && latestParams.current.get('roundId') === variables.roundId) setMessage(messageFor(error, 'Could not remove this Question. Refresh the list and review server feedback.')); await queryClient.invalidateQueries({ queryKey: ['admin-questions', user.id, variables.eventId, variables.roundId] }); },
  });

  const pending = createKey.isPending || editKey.isPending || createQuestion.isPending || editQuestion.isPending || removeQuestion.isPending;
  const selectedRound = round.data?.eventId === eventId ? round.data : undefined;
  const keyFiltersConfirmed = Boolean(keys.data?.filters && keys.data.filters.search === (keySearch || null) && keys.data.filters.used === (keyUsed ?? null));
  const questionFiltersConfirmed = Boolean(questions.data?.filters && questions.data.filters.search === (questionSearch || null) && questions.data.filters.used === (questionUsed ?? null));
  const selectedQuestion = questions.data?.data.find((item) => item.id === selectedQuestionId);

  function updateParams(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key); }
    setParams(next);
  }
  function applyKeySearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    updateParams({ keySearch: keySearchInput.trim() || null, keyUsed: keyUsedInput || null, keyPage: '1' });
  }
  function applyQuestionSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    updateParams({ questionSearch: questionSearchInput.trim() || null, questionUsed: questionUsedInput || null, questionPage: '1' });
  }
  function chooseRound(id: string) { updateParams({ roundId: id, questionPage: '1' }); setSelectedQuestionId(''); setCreatingQuestion(false); setEditingQuestion(false); setMessage(''); }
  function submitKey(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); if (keyFormEventId !== eventId) return; setMessage(''); if (editingKey && selectedKeyId) editKey.mutate({ eventId, id: selectedKeyId, value: keyForm }); else createKey.mutate({ eventId, value: keyForm }); }
  function submitQuestion(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); setMessage(''); if (editingQuestion && selectedQuestionId) editQuestion.mutate({ eventId, roundId, id: selectedQuestionId, questionText: questionForm.questionText }); else createQuestion.mutate({ eventId, roundId, keyId: questionForm.keyId, questionText: questionForm.questionText }); }

  if (!eventId) return <main className={styles.page}><p className={styles.eyebrow}>OPERATIONS / CONFIGURATION</p><h1>Questions &amp; Keys</h1><p>Choose an Game before managing its Key pool or Game Questions.</p><Link className={styles.action} to={{ pathname: '/admin/event', search: params.toString() ? `?${params}` : '' }}>Select an Game</Link></main>;

  function statusError(error: unknown, noun: string) { return error instanceof ApiError && error.status === 403 ? `Your account cannot manage ${noun}.` : messageFor(error, `Could not load ${noun}.`); }
  return <main className={styles.page}>
    <p className={styles.eyebrow}>OPERATIONS / CONFIGURATION</p>
    <header className={styles.heading}><div><h1>Questions &amp; Keys</h1><p>{event.data ? `Event: ${event.data.title}` : 'Loading selected Game…'}</p></div></header>
    {event.error && <p className={styles.notice} role="alert">{statusError(event.error, 'this Game')} <button type="button" onClick={() => void event.refetch()}>Retry Game</button></p>}
    {message && <p className={styles.notice} role="status">{message}</p>}
    <p className={styles.pendingContract}>Search and usage filters are sent to the server. A confirmation notice appears if the backend has not applied the requested filters.</p>
    <div className={styles.columns}>
      <section className={styles.panel} aria-labelledby="key-heading"><header className={styles.sectionHeading}><h2 id="key-heading">Game Key pool</h2><button type="button" disabled={pending} onClick={() => { setCreatingKey(true); setEditingKey(false); setKeyForm(''); setKeyFormEventId(eventId); }}>Create Key</button></header>
        <form className={styles.search} role="search" aria-label="Search Game Keys" onSubmit={applyKeySearch}><label>Search all Game Keys<input type="search" maxLength={100} value={keySearchInput} onChange={(e) => setKeySearchInput(e.target.value)} /></label><label>Usage<select value={keyUsedInput} onChange={(e) => setKeyUsedInput(e.target.value)}><option value="">All Keys</option><option value="false">Unused</option><option value="true">Used</option></select></label><button type="submit" disabled={pending}>Search Keys</button></form>
        {(keySearch || keyUsed !== undefined) && keys.data && !keyFiltersConfirmed && <p className={styles.notice} role="status">The server did not confirm these filters. Treat the displayed Key page as unfiltered; global search is unavailable until the backend contract is deployed.</p>}
        {keys.isPending && <p role="status">Loading Keys…</p>}
        {keys.error && <div><p role="alert">{statusError(keys.error, 'Keys')}</p><button type="button" onClick={() => void keys.refetch()}>Retry Keys</button></div>}
        {keys.data?.data.length === 0 && <p>{keySearch || keyUsed !== undefined ? keyFiltersConfirmed ? 'No Keys match these filters.' : 'No Keys returned on this page; filter application is unconfirmed.' : 'No Keys are configured for this Game.'}</p>}
        {keys.data && keys.data.data.length > 0 && <ul className={styles.list}>{keys.data.data.map((key) => <li key={key.id}><button type="button" aria-pressed={selectedKeyId === key.id} onClick={() => { setSelectedKeyId(key.id); setEditingKey(false); setCreatingKey(false); }}>{key.value}</button><span>{key.used === undefined ? 'Usage unavailable' : key.used ? 'Used' : 'Unused'}{key.canEdit === false ? ' · Locked' : ''}</span><button type="button" disabled={pending || key.canEdit === false} onClick={() => { setSelectedKeyId(key.id); setKeyForm(key.value); setKeyFormEventId(eventId); setEditingKey(true); setCreatingKey(false); }}>Edit Key</button></li>)}</ul>}
        {keys.data && <nav className={styles.pagination} aria-label="Key pages"><button type="button" disabled={keyPage <= 1 || pending} onClick={() => updateParams({ keyPage: String(keyPage - 1) })}>Previous</button><span>Page {keys.data.pagination.page} of {keys.data.pagination.totalPages}</span><button type="button" disabled={keyPage >= keys.data.pagination.totalPages || pending} onClick={() => updateParams({ keyPage: String(keyPage + 1) })}>Next</button></nav>}
        {keyFormEventId === eventId && (creatingKey || editingKey) && <form className={styles.form} onSubmit={submitKey}><h3>{editingKey ? 'Edit Key' : 'Create a Key'}</h3><label>Key value<input minLength={2} maxLength={50} pattern="[A-Za-z0-9 -]+" required value={keyForm} disabled={pending} onChange={(e) => setKeyForm(e.target.value)} /></label><p>Use 2–50 letters, numbers, spaces, or hyphens. The server normalizes the saved Key.</p><div className={styles.actions}><button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save Key'}</button><button type="button" disabled={pending} onClick={() => { setCreatingKey(false); setEditingKey(false); setKeyFormEventId(''); }}>Cancel</button></div></form>}
      </section>
      <section className={styles.panel} aria-labelledby="question-heading"><header className={styles.sectionHeading}><div><h2 id="question-heading">Game Questions</h2><p>{selectedRound ? `Round ${selectedRound.sequenceNumber}: ${selectedRound.name} · ${selectedRound.status}` : 'Select a Game'}</p></div>{selectedRound && <button type="button" disabled={pending} onClick={() => { setCreatingQuestion(true); setEditingQuestion(false); setSelectedQuestionId(''); setQuestionForm({ keyId: '', questionText: '' }); }}>Add Question</button>}</header>
        <form className={styles.search} role="search" aria-label="Search Game Questions" onSubmit={applyQuestionSearch}><label>Search all Questions in this Game<input type="search" maxLength={100} value={questionSearchInput} disabled={!selectedRound} onChange={(e) => setQuestionSearchInput(e.target.value)} /></label><label>Usage<select value={questionUsedInput} disabled={!selectedRound} onChange={(e) => setQuestionUsedInput(e.target.value)}><option value="">All Questions</option><option value="false">Unused</option><option value="true">Used</option></select></label><button type="submit" disabled={pending || !selectedRound}>Search Questions</button></form>
        {(questionSearch || questionUsed !== undefined) && questions.data && !questionFiltersConfirmed && <p className={styles.notice} role="status">The server did not confirm these filters. Treat the displayed Question page as unfiltered; global search is unavailable until the backend contract is deployed.</p>}
        {!roundId && <p>Choose a Game from this Game to load its Questions.</p>}
        {rounds.isPending && <p role="status">Loading Games…</p>}
        {rounds.error && <div><p role="alert">{statusError(rounds.error, 'Games')}</p><button type="button" onClick={() => void rounds.refetch()}>Retry Games</button></div>}
        {rounds.data && rounds.data.data.length === 0 && <p>No Games are configured for this Game.</p>}
        {roundId && round.data && round.data.eventId !== eventId && <p role="status">The selected Game belongs to another Game. Choose a Game from this Game.</p>}
        {rounds.data && rounds.data.data.length > 0 && <label>Selected Game<select value={roundId} disabled={pending} onChange={(e) => chooseRound(e.target.value)}><option value="">Choose a Game</option>{rounds.data.data.map((item) => <option key={item.id} value={item.id}>{item.sequenceNumber}. {item.name} ({item.status})</option>)}</select></label>}
        {rounds.data && rounds.data.pagination.totalPages > 1 && <p>Showing the first 100 Games. <Link to={`/admin/rounds?eventId=${encodeURIComponent(eventId)}`}>Open Game configuration</Link> to choose from the full paginated list.</p>}
        {selectedRound && rounds.data && !rounds.data.data.some((item) => item.id === selectedRound.id) && <p>The selected Game is outside the first 100. <Link to={`/admin/rounds?eventId=${encodeURIComponent(eventId)}`}>Open Game configuration</Link> to choose it from the paginated list.</p>}
        {roundId && questions.isPending && <p role="status">Loading Questions…</p>}
        {questions.error && <div><p role="alert">{statusError(questions.error, 'Questions')}</p><button type="button" onClick={() => void questions.refetch()}>Retry Questions</button></div>}
        {selectedRound && questions.data?.data.length === 0 && <p>{questionSearch || questionUsed !== undefined ? questionFiltersConfirmed ? 'No Questions match these filters.' : 'No Questions returned on this page; filter application is unconfirmed.' : 'No Questions are configured for this Game.'}</p>}
        {selectedRound && questions.data && questions.data.data.length > 0 && <ul className={styles.list}>{questions.data.data.map((question) => <li key={question.id}><button type="button" aria-pressed={selectedQuestionId === question.id} onClick={() => { setSelectedQuestionId(question.id); setCreatingQuestion(false); setEditingQuestion(false); }}>{question.keyValue}<span>{question.questionText}</span></button><span>{question.used === undefined ? 'Usage unavailable' : question.used ? 'Used' : 'Unused'}{question.canEdit === false ? ' · Locked' : ''}</span><button type="button" disabled={pending || question.canEdit === false} onClick={() => { setSelectedQuestionId(question.id); setQuestionForm({ keyId: question.keyId, questionText: question.questionText }); setEditingQuestion(true); setCreatingQuestion(false); }}>Edit</button><button type="button" disabled={pending || question.canEdit === false} onClick={() => { if (window.confirm('Remove this Question from the Game? The server will reject removal if its history is immutable.')) removeQuestion.mutate({ eventId, roundId, id: question.id }); }}>Remove</button></li>)}</ul>}
        {selectedRound && questions.data && <nav className={styles.pagination} aria-label="Question pages"><button type="button" disabled={questionPage <= 1 || pending} onClick={() => updateParams({ questionPage: String(questionPage - 1) })}>Previous</button><span>Page {questions.data.pagination.page} of {questions.data.pagination.totalPages}</span><button type="button" disabled={questionPage >= questions.data.pagination.totalPages || pending} onClick={() => updateParams({ questionPage: String(questionPage + 1) })}>Next</button></nav>}
        {selectedRound && selectedQuestionId && selectedQuestionId === selectedQuestion?.id && !editingQuestion && <article className={styles.detail}><h3>{selectedQuestion.keyValue}</h3><p>{selectedQuestion.questionText}</p></article>}
        {selectedRound && (creatingQuestion || editingQuestion) && <form className={styles.form} onSubmit={submitQuestion}><h3>{editingQuestion ? 'Edit Question' : 'Associate Question and Key'}</h3>{creatingQuestion && <label>Key<select required value={questionForm.keyId} disabled={pending} onChange={(e) => setQuestionForm({ ...questionForm, keyId: e.target.value })}><option value="">Choose a Key</option>{keys.data?.data.map((key) => <option key={key.id} value={key.id}>{key.value}</option>)}</select>{(keys.data?.pagination.totalPages ?? 1) > 1 && <small>Key selection shows this page of the Game Key pool; navigate Key pages to load other Keys.</small>}</label>}<label>Question text<textarea minLength={10} maxLength={500} required rows={4} value={questionForm.questionText} disabled={pending} onChange={(e) => setQuestionForm({ ...questionForm, questionText: e.target.value })} /></label><p>10–500 characters. This is the clue shown to participants; its Key remains backend-managed.</p><div className={styles.actions}><button type="submit" disabled={pending || (creatingQuestion && !questionForm.keyId)}>{pending ? 'Saving…' : editingQuestion ? 'Save Question' : 'Save association'}</button><button type="button" disabled={pending} onClick={() => { setCreatingQuestion(false); setEditingQuestion(false); }}>Cancel</button></div></form>}
      </section>
    </div>
  </main>;
}
