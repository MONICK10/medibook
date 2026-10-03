// src/pages/admin/AuditLogPage.jsx
// -----------------------------------------------------------------
// The audit trail: who did what, when, from where.
//
// WHY a clinic needs this screen at all: "which member of staff opened
// this patient's report, and when?" is a question that arrives months
// later, from a regulator, a complaint, or a court. Normal server logs
// are rotated away in a fortnight; this lives in the database, is
// append-only, and is readable here.
//
// The list is paginated and newest-first, and the action filter is
// built from the actions actually present rather than a hardcoded
// list, so a new action type appears in the dropdown by itself.
// -----------------------------------------------------------------

import { Fragment, useCallback, useEffect, useState } from 'react';
import { api, queryString } from '../../api/client.js';
import {
  Empty,
  ErrorMessage,
  LoadingArea,
  Pager,
  formatTimestamp,
} from '../../components/ui.jsx';
import './AdminPages.css';

const PAGE_SIZE = 50;

// Plain-English names for the action codes, and how serious each is.
//
// 'alert' marks the ones worth noticing in a list of hundreds: failed
// logins, role changes, deletions, and anybody opening a medical
// report. The colour is only a hint - the written label is always
// there, so nothing depends on seeing it.
const ACTIONS = {
  'auth.login.success': { label: 'Signed in' },
  'auth.login.failed': { label: 'Failed sign-in', tone: 'alert' },
  'auth.logout': { label: 'Signed out' },
  'auth.register': { label: 'Account registered' },
  'auth.password.reset.requested': { label: 'Password reset requested' },
  'auth.password.reset.completed': { label: 'Password reset completed', tone: 'alert' },
  'auth.password.changed': { label: 'Password changed', tone: 'alert' },
  'user.role.changed': { label: 'Role changed', tone: 'alert' },
  'user.deactivated': { label: 'Account deactivated', tone: 'alert' },
  'user.reactivated': { label: 'Account reactivated', tone: 'alert' },
  'doctor.created': { label: 'Doctor created' },
  'doctor.updated': { label: 'Doctor updated' },
  'specialty.created': { label: 'Specialty created' },
  'specialty.updated': { label: 'Specialty updated' },
  'specialty.deleted': { label: 'Specialty deleted', tone: 'alert' },
  'appointment.booked': { label: 'Appointment booked' },
  'appointment.cancelled': { label: 'Appointment cancelled' },
  'appointment.rescheduled': { label: 'Appointment moved' },
  'appointment.outcome.set': { label: 'Visit outcome set' },
  'prescription.created': { label: 'Prescription written' },
  'prescription.updated': { label: 'Prescription changed', tone: 'alert' },
  'report.uploaded': { label: 'Report uploaded' },
  'report.downloaded': { label: 'Report opened', tone: 'alert' },
  'report.access.denied': { label: 'Report access REFUSED', tone: 'alert' },
};

function describeAction(action) {
  return ACTIONS[action] || { label: action };
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [availableActions, setAvailableActions] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [action, setAction] = useState('');
  const [expanded, setExpanded] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get(
        `/api/admin/audit-logs${queryString({ action, limit: PAGE_SIZE, offset })}`
      );
      setLogs(result.logs);
      setTotal(result.total);
      setAvailableActions(result.availableActions);
    } catch (apiError) {
      setError(apiError);
    } finally {
      setLoading(false);
    }
  }, [action, offset]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Audit log</h1>
          <p>Sign-ins, record changes, and every medical report that was opened.</p>
        </div>
      </div>

      {/* ---------- filter ---------- */}
      <section className="card browse-filters">
        <div className="filters">
          <div className="field">
            <label htmlFor="action">Action</label>
            <select
              id="action"
              value={action}
              onChange={(event) => {
                setOffset(0);
                setAction(event.target.value);
              }}
            >
              <option value="">Everything</option>
              {availableActions.map((code) => (
                <option key={code} value={code}>
                  {describeAction(code).label}
                </option>
              ))}
            </select>
          </div>

          <div className="filters__actions">
            <button type="button" className="btn btn--secondary" onClick={load}>
              Refresh
            </button>
            {action ? (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setOffset(0);
                  setAction('');
                }}
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <ErrorMessage error={error} onDismiss={() => setError(null)} />

      {loading ? (
        <LoadingArea label="Loading the audit log..." />
      ) : logs.length === 0 ? (
        <div className="card">
          <Empty title="Nothing recorded">
            <p className="small">
              {action
                ? 'No entries of that kind yet.'
                : 'The audit log is empty. It fills as people use the app.'}
            </p>
          </Empty>
        </div>
      ) : (
        <>
          <section className="card card--flush">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th className="wrap">Action</th>
                    <th className="wrap">Who</th>
                    <th>From</th>
                    <th>
                      <span className="sr-only">Detail</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((entry) => {
                    const described = describeAction(entry.action);
                    const isOpen = expanded === entry.id;
                    const hasDetail =
                      entry.metadata && Object.keys(entry.metadata).length > 0;

                    return (
                      // The KEY goes on the Fragment, because the map
                      // returns two rows per entry. Keying the rows
                      // instead leaves the fragment unkeyed and React
                      // warns about it.
                      <Fragment key={entry.id}>
                        <tr
                          className={
                            described.tone === 'alert' ? 'audit-row--alert' : undefined
                          }
                        >
                          <td className="nowrap small">
                            {formatTimestamp(entry.createdAt)}
                          </td>

                          <td className="wrap">
                            <span className="strong">{described.label}</span>
                            {/* The raw code too, so it can be matched
                                against the backend's ACTIONS list. */}
                            <div className="small muted audit-code">{entry.action}</div>
                          </td>

                          <td className="wrap">
                            {entry.actorEmail ? (
                              <>
                                <div>{entry.actorEmail}</div>
                                <div className="small muted">{entry.actorRole}</div>
                              </>
                            ) : (
                              <span className="muted">Not signed in</span>
                            )}
                          </td>

                          <td className="small muted nowrap">{entry.ip || '-'}</td>

                          <td>
                            {hasDetail ? (
                              <button
                                type="button"
                                className="btn btn--ghost btn--small"
                                aria-expanded={isOpen}
                                onClick={() => setExpanded(isOpen ? null : entry.id)}
                              >
                                {isOpen ? 'Hide' : 'Detail'}
                              </button>
                            ) : null}
                          </td>
                        </tr>

                        {isOpen ? (
                          <tr className="audit-detail-row">
                            <td colSpan={5}>
                              <div className="audit-detail">
                                <dl>
                                  {Object.entries(entry.metadata).map(([key, value]) => (
                                    <div key={key}>
                                      <dt>{key}</dt>
                                      <dd>
                                        {typeof value === 'object'
                                          ? JSON.stringify(value)
                                          : String(value)}
                                      </dd>
                                    </div>
                                  ))}
                                  {entry.entityType ? (
                                    <div>
                                      <dt>record</dt>
                                      <dd>
                                        {entry.entityType} {entry.entityId}
                                      </dd>
                                    </div>
                                  ) : null}
                                  {entry.userAgent ? (
                                    <div>
                                      <dt>browser</dt>
                                      <dd className="audit-detail__ua">
                                        {entry.userAgent}
                                      </dd>
                                    </div>
                                  ) : null}
                                </dl>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <Pager total={total} limit={PAGE_SIZE} offset={offset} onChange={setOffset} />
        </>
      )}

      <p className="small muted">
        Entries are never edited or deleted - an audit trail you can change is not an
        audit trail. Passwords, tokens and the contents of medical records are
        deliberately never written here.
      </p>
    </div>
  );
}
