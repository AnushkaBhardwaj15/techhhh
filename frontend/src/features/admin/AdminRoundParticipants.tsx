import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../../lib/api/client';
import { getRoundRoster } from '../../lib/api/roundRoster';
import styles from './AdminRoundParticipants.module.css';

export function AdminRoundParticipants({ roundId }: { roundId: string }) {
  const roster = useQuery({
    queryKey: ['admin-round-participants', roundId],
    queryFn: ({ signal }) => getRoundRoster(roundId, signal),
    enabled: Boolean(roundId),
    refetchInterval: 3_000,
    refetchOnWindowFocus: 'always',
  });
  const denied = roster.error instanceof ApiError && [401, 403].includes(roster.error.status);
  const data = denied ? undefined : roster.data;
  return <section className={styles.section} aria-labelledby="joined-participants-title">
    <header className={styles.heading}>
      <h2 id="joined-participants-title">Joined participants</h2>
      {data && <p className={styles.total}>Total joined: <strong>{data.total}</strong></p>}
    </header>
    <p className={styles.description}>Each participant is counted once, including those who disconnect. Assigned tickets alone are not counted.</p>
    {roster.isPending && <p role="status">Loading joined participants…</p>}
    {roster.error && <div role="alert"><p>{roster.error instanceof ApiError && roster.error.status === 403
      ? 'Your account cannot view joined participants.'
      : 'Could not refresh joined participants.'}</p>
      {data && <p>Showing the last saved list; the count may be out of date.</p>}
      <button type="button" onClick={() => void roster.refetch()}>Retry participant list</button>
    </div>}
    {data?.total === 0 && <p>No recorded joins yet. Participants appear after joining with this game’s code.</p>}
    {Boolean(data?.participants.length) && <p className={styles.scrollHint}>Scroll horizontally to view all participant details.</p>}
    {Boolean(data?.participants.length) && <div className={styles.tableWrap} role="region" aria-label="Joined participant list; scroll horizontally" tabIndex={0}>
      <table><caption>Participants who joined this game</caption><thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Joined at</th></tr></thead>
        <tbody>{data?.participants.map((person) => <tr key={person.id}>
          <td>{person.name}</td><td>{person.email}</td><td><time dateTime={person.joinedAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(person.joinedAt))}</time></td>
        </tr>)}</tbody></table>
    </div>}
  </section>;
}
