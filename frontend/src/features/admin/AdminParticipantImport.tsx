import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../lib/api/client';
import { importAdminParticipants } from '../../lib/api/adminParticipants';
import type { ParticipantImportReport } from '../../types/adminParticipant';
import { parseParticipantCsv, PARTICIPANT_CSV_PREVIEW_ROWS, readParticipantCsvFile } from './participantCsv';
import type { ParticipantCsvPreview } from './participantCsv';
import styles from './AdminParticipants.module.css';

export function AdminParticipantImport({ eventId, batchName, onPendingChange }: { eventId: string; userId: string; batchName?: string; onPendingChange: (pending: boolean) => void }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParticipantCsvPreview | null>(null);
  const [report, setReport] = useState<ParticipantImportReport | null>(null);
  const [fileError, setFileError] = useState('');
  const [message, setMessage] = useState('');
  const [ambiguous, setAmbiguous] = useState(false);
  const [retryAllowed, setRetryAllowed] = useState(false);
  const [reading, setReading] = useState(false);
  const attemptKey = useRef('');
  const requestLock = useRef(false);
  const readVersion = useRef(0);

  useEffect(() => {
    readVersion.current++;
    setFile(null); setPreview(null); setReport(null); setFileError(''); setMessage(''); setAmbiguous(false); setRetryAllowed(false); attemptKey.current = '';
    setReading(false); onPendingChange(false);
  }, [eventId, batchName, onPendingChange]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!file || !attemptKey.current) throw new Error('Choose a valid CSV file before importing.');
      return importAdminParticipants({ eventId, file, batchName, idempotencyKey: attemptKey.current });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['participant-batches'] });
      setReport(result); setAmbiguous(false); setRetryAllowed(false); setMessage('The server returned this import report.');
      await queryClient.invalidateQueries({ queryKey: ['admin-participants'] });
    },
    onError: async (error) => {
      const uncertain = !(error instanceof ApiError) || error.status === 0 || error.status >= 1000;
      setReport(null); setAmbiguous(uncertain); setRetryAllowed(false);
      setMessage(uncertain
        ? 'The request outcome is unknown. We requested a refresh of the current Participant results; review them before enabling a deliberate retry.'
        : error instanceof ApiError && error.status === 403
          ? 'Your account cannot import Participants.'
          : error instanceof ApiError
            ? `The server did not accept the import: ${error.message}`
            : 'The import could not be completed. Review the current Participant results before trying again.');
      await queryClient.invalidateQueries({ queryKey: ['admin-participants'] });
    },
    onSettled: () => { requestLock.current = false; onPendingChange(false); },
  });

  async function chooseFile(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const selected = input.files?.[0] ?? null;
    setFile(selected); setPreview(null); setReport(null); setFileError(''); setMessage(''); setAmbiguous(false); setRetryAllowed(false);
    attemptKey.current = selected ? crypto.randomUUID() : '';
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith('.csv')) { setFileError('Choose a .csv file.'); return; }
    const currentRead = ++readVersion.current;
    setReading(true);
    onPendingChange(true);
    try {
      const parsed = parseParticipantCsv(await readParticipantCsvFile(selected));
      if (currentRead === readVersion.current) setPreview(parsed);
    } catch (error) {
      if (currentRead === readVersion.current) setFileError(error instanceof Error ? error.message : 'We could not read this CSV file.');
    } finally {
      if (currentRead === readVersion.current) { setReading(false); onPendingChange(false); input.value = ''; }
    }
  }

  function confirmImport() {
    if (!file || !preview || preview.issues.length || !preview.totalRows || mutation.isPending || requestLock.current || (ambiguous && !retryAllowed)) return;
    requestLock.current = true; setMessage(''); onPendingChange(true); mutation.mutate();
  }

  const issueList = report?.errors ?? [];
  return <section className={`${styles.panel} ${styles.importPanel}`} aria-labelledby="participant-import-title">
    <div className={styles.importHeading}><div><h2 id="participant-import-title">Import Participants from CSV</h2><p>Preview the file, confirm once, then review the server’s final report.</p></div></div>
    {message && <p className={ambiguous ? styles.ambiguous : styles.notice} role={ambiguous ? 'alert' : 'status'}>{message}</p>}
    {ambiguous && !retryAllowed && <button type="button" onClick={() => setRetryAllowed(true)}>I reviewed the current results; enable a deliberate retry</button>}
    {ambiguous && retryAllowed && <p role="note">A retry will use the same idempotency key for this selected file.</p>}
    <div className={styles.form}>
      <label>CSV file<input type="file" accept=".csv,text/csv" disabled={mutation.isPending || reading || ambiguous} onChange={chooseFile} /></label>
      <p>UTF-8 CSV, up to 10 MiB and 1000 data rows. Required headers: <code>email,password</code>; optional: <code>external_id</code>.</p>
    </div>
    {reading && <p role="status">Reading CSV…</p>}
    {fileError && <p role="alert">{fileError}</p>}
    {preview && <div className={styles.preview}>
      <p>Local structure preview: {preview.totalRows} data rows. Showing up to {PARTICIPANT_CSV_PREVIEW_ROWS}. Duplicate account and credential checks happen on the server after confirmation.</p>
      {preview.issues.length > 0 && <ul className={styles.issues} aria-label="CSV structure issues">{preview.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
      {preview.headers.length > 0 && <div className={styles.tableWrap}><table><caption>CSV preview</caption><thead><tr>{preview.headers.map((header, index) => <th key={`${header}-${index}`} scope="col">{header || `Column ${index + 1}`}</th>)}</tr></thead><tbody>{preview.rows.map((row, rowIndex) => <tr key={rowIndex}>{preview.headers.map((_, columnIndex) => <td key={columnIndex}>{preview.headers[columnIndex]?.toLowerCase() === 'password' ? '••••••••' : row[columnIndex] ?? ''}</td>)}</tr>)}</tbody></table></div>}
      <div className={styles.actions}>
        <button type="button" disabled={!preview.totalRows || preview.issues.length > 0 || mutation.isPending || reading || (ambiguous && !retryAllowed)} onClick={confirmImport}>{mutation.isPending ? 'Importing…' : ambiguous ? 'Retry import deliberately' : `Confirm import of ${preview.totalRows} rows`}</button>
        <button type="button" disabled={mutation.isPending || reading} onClick={() => { setFile(null); setPreview(null); setReport(null); setFileError(''); setMessage(''); setAmbiguous(false); setRetryAllowed(false); attemptKey.current = ''; }}>Clear file</button>
      </div>
    </div>}
    {mutation.isPending && <p role="status">Import is processing. The server does not provide row-by-row progress.</p>}
    {report && <section className={styles.report} aria-labelledby="import-report-title"><h3 id="import-report-title">Import results</h3><dl className={styles.details}><div><dt>Rows received</dt><dd>{report.totalReceived}</dd></div><div><dt>Created</dt><dd>{report.createdCount}</dd></div><div><dt>Skipped</dt><dd>{report.skippedCount}</dd></div><div><dt>Failed</dt><dd>{report.failedCount}</dd></div></dl><p role="note">Participants sign in with the email and password supplied in your CSV.</p>{issueList.length > 0 && <div><h4>Row results</h4><ul className={styles.issues}>{issueList.map((item, index) => <li key={`${item.rowIndex}-${index}`}>Row {item.rowIndex}{item.email ? ` · ${item.email}` : ''}: {item.reason}</li>)}</ul></div>}</section>}
  </section>;
}
