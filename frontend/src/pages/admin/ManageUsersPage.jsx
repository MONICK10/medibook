// src/pages/admin/ManageUsersPage.jsx
// -----------------------------------------------------------------
// Deactivate and reactivate accounts.
//
// There is no delete. The appointments, reports and prescriptions
// attached to a person have to stay - the clinic needs its records,
// and deleting the user row would leave all of them pointing at
// nothing. Deactivating stops the login immediately (the backend
// checks isActive on every request) while the history stays intact.
//
// The backend also refuses two things this page cannot prevent: an
// admin deactivating themselves, and deactivating the last active
// admin. Both would lock everyone out of the admin area.
// -----------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { api, queryString } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import {
  Empty,
  ErrorMessage,
  LoadingArea,
  Message,
  Pager,
  Spinner,
  formatTimestamp,
} from '../../components/ui.jsx';
import './AdminPages.css';

const PAGE_SIZE = 25;

const ROLE_LABELS = { patient: 'Patient', doctor: 'Doctor', admin: 'Administrator' };

export default function ManageUsersPage() {
  const { user: me } = useAuth();

  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState({ role: '', isActive: '', search: '' });
  const [searchInput, setSearchInput] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get(
        `/api/admin/users${queryString({
          role: filters.role,
          isActive: filters.isActive,
          search: filters.search,
          limit: PAGE_SIZE,
          offset,
        })}`
      );
      setUsers(result.users);
      setTotal(result.total);
    } catch (apiError) {
      setError(apiError);
    } finally {
      setLoading(false);
    }
  }, [filters, offset]);

  useEffect(() => {
    load();
  }, [load]);

  async function setActive(target, isActive) {
    setBusyId(target.id);
    setError(null);
    setConfirming(null);
    try {
      const result = await api.patch(`/api/admin/users/${target.id}/status`, {
        isActive,
      });
      setNotice(result.message);
      load();
    } catch (apiError) {
      setError(apiError);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Users</h1>
          <p>Every account, and whether it can sign in.</p>
        </div>
      </div>

      {notice ? (
        <Message type="success" text={notice} onDismiss={() => setNotice(null)} />
      ) : null}
      <ErrorMessage error={error} onDismiss={() => setError(null)} />

      {/* ---------- filters ---------- */}
      <section className="card browse-filters">
        <form
          className="filters"
          onSubmit={(event) => {
            event.preventDefault();
            setOffset(0);
            setFilters((current) => ({ ...current, search: searchInput.trim() }));
          }}
        >
          <div className="field">
            <label htmlFor="search">Name or email</label>
            <input
              id="search"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="e.g. ravi"
            />
          </div>

          <div className="field">
            <label htmlFor="role">Role</label>
            <select
              id="role"
              value={filters.role}
              onChange={(event) => {
                setOffset(0);
                setFilters((current) => ({ ...current, role: event.target.value }));
              }}
            >
              <option value="">All roles</option>
              <option value="patient">Patients</option>
              <option value="doctor">Doctors</option>
              <option value="admin">Administrators</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="isActive">Status</label>
            <select
              id="isActive"
              value={filters.isActive}
              onChange={(event) => {
                setOffset(0);
                setFilters((current) => ({ ...current, isActive: event.target.value }));
              }}
            >
              <option value="">All</option>
              <option value="true">Active</option>
              <option value="false">Deactivated</option>
            </select>
          </div>

          <div className="filters__actions">
            <button type="submit" className="btn">
              Search
            </button>
          </div>
        </form>
      </section>

      {loading ? (
        <LoadingArea label="Loading users..." />
      ) : users.length === 0 ? (
        <div className="card">
          <Empty title="No users found">
            <p className="small">Try clearing the filters.</p>
          </Empty>
        </div>
      ) : (
        <>
          <section className="card card--flush">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th className="wrap">Name</th>
                    <th>Role</th>
                    <th>Last signed in</th>
                    <th>Status</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const isMe = user.id === me.id;

                    return (
                      <tr key={user.id}>
                        <td className="wrap">
                          <div className="strong">
                            {user.name}
                            {isMe ? <span className="muted small"> (you)</span> : null}
                          </div>
                          <div className="small muted">{user.email}</div>
                        </td>
                        <td>{ROLE_LABELS[user.role] || user.role}</td>
                        <td>
                          {user.lastLoginAt ? (
                            formatTimestamp(user.lastLoginAt)
                          ) : (
                            <span className="muted">Never</span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              user.isActive ? 'badge--completed' : 'badge--cancelled'
                            }`}
                          >
                            {user.isActive ? 'Active' : 'Deactivated'}
                          </span>
                        </td>
                        <td>
                          <div className="table-actions">
                            {isMe ? (
                              // Spelled out rather than just disabled,
                              // so it is clear this is deliberate.
                              <span className="small muted">
                                You cannot change your own account
                              </span>
                            ) : user.isActive ? (
                              <button
                                type="button"
                                className="btn btn--ghost btn--small"
                                onClick={() => setConfirming(user)}
                                disabled={busyId === user.id}
                              >
                                {busyId === user.id ? (
                                  <Spinner label="Saving" />
                                ) : (
                                  'Deactivate'
                                )}
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn btn--secondary btn--small"
                                onClick={() => setActive(user, true)}
                                disabled={busyId === user.id}
                              >
                                {busyId === user.id ? (
                                  <Spinner label="Saving" />
                                ) : (
                                  'Reactivate'
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
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
        Accounts are never deleted, because appointments and medical records point at
        them. A deactivated account cannot sign in, and is signed out of any session it
        already had.
      </p>

      {/* ---------- confirm deactivation ---------- */}
      {confirming ? (
        <div className="modal-backdrop" onClick={() => setConfirming(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="deactivate-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal__head">
              <h2 id="deactivate-title">Deactivate {confirming.name}?</h2>
            </div>

            <p className="muted">
              They will be signed out straight away and will not be able to sign in
              again until an administrator reactivates them.
            </p>

            {confirming.role === 'doctor' ? (
              <Message
                type="warning"
                text="This doctor will disappear from the public list."
                detail="Appointments already booked with them are NOT cancelled. Check their schedule first."
              />
            ) : null}

            <div className="row row--end">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setConfirming(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => setActive(confirming, false)}
              >
                Deactivate
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
