// src/pages/admin/ManageSpecialtiesPage.jsx
// -----------------------------------------------------------------
// Add, rename and delete specialties.
//
// Delete is blocked while any doctor still belongs to the specialty.
// The doctor count is shown in the table so the admin can see which
// ones can go before clicking - and the backend refuses anyway, with
// a message naming the number of doctors.
// -----------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import {
  Empty,
  ErrorMessage,
  Field,
  LoadingArea,
  Message,
  Spinner,
} from '../../components/ui.jsx';
import './AdminPages.css';

export default function ManageSpecialtiesPage() {
  const [specialties, setSpecialties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [editing, setEditing] = useState(null); // 'new' | specialty
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get('/api/admin/specialties');
      setSpecialties(result.specialties);
    } catch (apiError) {
      setError(apiError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(specialty) {
    setError(null);
    try {
      const result = await api.delete(`/api/admin/specialties/${specialty.id}`);
      setNotice(result.message);
      setConfirmDelete(null);
      load();
    } catch (apiError) {
      setError(apiError);
      setConfirmDelete(null);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Specialties</h1>
          <p>The departments the clinic covers.</p>
        </div>
        <button type="button" className="btn" onClick={() => setEditing('new')}>
          Add a specialty
        </button>
      </div>

      {notice ? (
        <Message type="success" text={notice} onDismiss={() => setNotice(null)} />
      ) : null}
      <ErrorMessage error={error} onDismiss={() => setError(null)} />

      {loading ? (
        <LoadingArea label="Loading specialties..." />
      ) : specialties.length === 0 ? (
        <div className="card">
          <Empty title="No specialties yet">
            <p className="small">
              Add a specialty before adding doctors - every doctor needs one.
            </p>
          </Empty>
        </div>
      ) : (
        <section className="card card--flush">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Specialty</th>
                  <th className="wrap">Description</th>
                  <th>Doctors</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {specialties.map((specialty) => (
                  <tr key={specialty.id}>
                    <td className="strong">{specialty.name}</td>
                    <td className="wrap muted">
                      {specialty.description || <span className="muted">-</span>}
                    </td>
                    <td>{specialty.doctorCount}</td>
                    <td>
                      <div className="table-actions">
                        <button
                          type="button"
                          className="btn btn--secondary btn--small"
                          onClick={() => setEditing(specialty)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--small"
                          onClick={() => setConfirmDelete(specialty)}
                          // Disabled when in use, with the reason in
                          // the title so hovering explains it.
                          disabled={specialty.doctorCount > 0}
                          title={
                            specialty.doctorCount > 0
                              ? `${specialty.doctorCount} doctor(s) are still in this specialty`
                              : 'Delete this specialty'
                          }
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="small muted">
        A specialty cannot be deleted while doctors still belong to it. Move them to
        another specialty first.
      </p>

      {editing ? (
        <SpecialtyDialog
          specialty={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            setNotice(message);
            load();
          }}
        />
      ) : null}

      {confirmDelete ? (
        <div className="modal-backdrop" onClick={() => setConfirmDelete(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal__head">
              <h2 id="delete-title">Delete {confirmDelete.name}?</h2>
            </div>
            <p className="muted">
              This cannot be undone. The specialty will no longer be available when
              adding a doctor.
            </p>
            <div className="row row--end">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setConfirmDelete(null)}
              >
                Keep it
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => remove(confirmDelete)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SpecialtyDialog({ specialty, onClose, onSaved }) {
  const isNew = !specialty;

  const [name, setName] = useState(specialty ? specialty.name : '');
  const [description, setDescription] = useState(
    specialty ? specialty.description || '' : ''
  );
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setBusy(true);

    try {
      if (isNew) {
        await api.post('/api/admin/specialties', { name, description });
        onSaved(`${name} has been added.`);
      } else {
        const result = await api.patch(`/api/admin/specialties/${specialty.id}`, {
          name,
          description,
        });
        onSaved(result.message);
      }
    } catch (apiError) {
      if (apiError.details) setFieldErrors(apiError.details);
      setError(apiError);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="specialty-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal__head">
          <h2 id="specialty-dialog-title">
            {isNew ? 'Add a specialty' : 'Edit specialty'}
          </h2>
          <button type="button" className="btn btn--ghost btn--small" onClick={onClose}>
            Close
          </button>
        </div>

        <form className="form" onSubmit={handleSubmit} noValidate>
          <ErrorMessage error={error} onDismiss={() => setError(null)} />

          <Field
            label="Name"
            name="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setFieldErrors({});
            }}
            error={fieldErrors.name}
            required
            autoFocus
            placeholder="e.g. Cardiology"
          />

          <Field
            label="Description"
            name="description"
            error={fieldErrors.description}
            hint="A sentence shown to patients on the home page."
          >
            <textarea
              id="description"
              name="description"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              aria-describedby="description-hint"
            />
          </Field>

          <div className="row row--end">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button type="submit" className="btn" disabled={busy}>
              {busy ? <Spinner label="Saving" /> : isNew ? 'Add specialty' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
