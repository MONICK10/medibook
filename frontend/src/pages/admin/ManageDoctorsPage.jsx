// src/pages/admin/ManageDoctorsPage.jsx
// -----------------------------------------------------------------
// Add, edit, activate and deactivate doctors.
//
// Note how a new doctor's password works: the admin never chooses or
// sees it. The backend generates one and emails it, which with
// MAIL_MODE=console means it prints in the backend terminal. An admin
// who could set the password would know it, and could then sign in as
// that doctor and read patient records.
//
// Activate/deactivate acts on the USER account, not a separate doctor
// flag, so there is one source of truth for "can this person sign in".
// -----------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { api, queryString } from '../../api/client.js';
import {
  Empty,
  ErrorMessage,
  Field,
  LoadingArea,
  Message,
  Pager,
  Spinner,
  formatMoney,
} from '../../components/ui.jsx';
import { CENTS_PER_UNIT, CURRENCY_SYMBOL } from '../../config.js';
import './AdminPages.css';

const PAGE_SIZE = 25;

export default function ManageDoctorsPage() {
  const [doctors, setDoctors] = useState([]);
  const [specialties, setSpecialties] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState({ search: '', specialtyId: '', isActive: '' });
  const [searchInput, setSearchInput] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [editing, setEditing] = useState(null); // 'new' | doctor object

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get(
        `/api/admin/doctors${queryString({
          search: filters.search,
          specialtyId: filters.specialtyId,
          isActive: filters.isActive,
          limit: PAGE_SIZE,
          offset,
        })}`
      );
      setDoctors(result.doctors);
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

  useEffect(() => {
    api
      .get('/api/admin/specialties')
      .then((result) => setSpecialties(result.specialties))
      .catch(() => {});
  }, []);

  async function setActive(doctor, isActive) {
    setError(null);
    try {
      // Note the USER id, not the doctor profile id: the account is
      // what gets deactivated.
      const result = await api.patch(`/api/admin/users/${doctor.userId}/status`, {
        isActive,
      });
      setNotice(result.message);
      load();
    } catch (apiError) {
      setError(apiError);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Doctors</h1>
          <p>Add a doctor, edit their details, or stop their account.</p>
        </div>
        <button type="button" className="btn" onClick={() => setEditing('new')}>
          Add a doctor
        </button>
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
            <label htmlFor="search">Name</label>
            <input
              id="search"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="e.g. Rao"
            />
          </div>

          <div className="field">
            <label htmlFor="specialtyFilter">Specialty</label>
            <select
              id="specialtyFilter"
              value={filters.specialtyId}
              onChange={(event) => {
                setOffset(0);
                setFilters((current) => ({
                  ...current,
                  specialtyId: event.target.value,
                }));
              }}
            >
              <option value="">All</option>
              {specialties.map((specialty) => (
                <option key={specialty.id} value={specialty.id}>
                  {specialty.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="activeFilter">Status</label>
            <select
              id="activeFilter"
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
        <LoadingArea label="Loading doctors..." />
      ) : doctors.length === 0 ? (
        <div className="card">
          <Empty title="No doctors found">
            <p className="small">Try clearing the filters, or add a doctor.</p>
          </Empty>
        </div>
      ) : (
        <>
          <section className="card card--flush">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th className="wrap">Doctor</th>
                    <th>Specialty</th>
                    <th>Fee</th>
                    <th>Experience</th>
                    <th>Status</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {doctors.map((doctor) => (
                    <tr key={doctor.id}>
                      <td className="wrap">
                        <div className="strong">{doctor.name}</div>
                        <div className="small muted">{doctor.email}</div>
                        {doctor.phone ? (
                          <div className="small muted">{doctor.phone}</div>
                        ) : null}
                      </td>
                      <td>{doctor.specialtyName || <span className="muted">-</span>}</td>
                      <td>{formatMoney(doctor.feeCents)}</td>
                      <td>{doctor.experienceYears} yrs</td>
                      <td>
                        <span
                          className={`badge ${
                            doctor.isActive ? 'badge--completed' : 'badge--cancelled'
                          }`}
                        >
                          {doctor.isActive ? 'Active' : 'Deactivated'}
                        </span>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            type="button"
                            className="btn btn--secondary btn--small"
                            onClick={() => setEditing(doctor)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className={`btn btn--small ${
                              doctor.isActive ? 'btn--ghost' : 'btn--secondary'
                            }`}
                            onClick={() => setActive(doctor, !doctor.isActive)}
                          >
                            {doctor.isActive ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <Pager total={total} limit={PAGE_SIZE} offset={offset} onChange={setOffset} />
        </>
      )}

      {editing ? (
        <DoctorDialog
          doctor={editing === 'new' ? null : editing}
          specialties={specialties}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            setNotice(message);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

// ---------- add / edit dialog ----------
function DoctorDialog({ doctor, specialties, onClose, onSaved }) {
  const isNew = !doctor;

  const [form, setForm] = useState({
    name: doctor ? doctor.name : '',
    email: doctor ? doctor.email : '',
    phone: doctor ? doctor.phone || '' : '',
    specialtyId: doctor ? doctor.specialtyId || '' : '',
    qualification: doctor ? doctor.qualification || '' : '',
    experienceYears: doctor ? String(doctor.experienceYears ?? 0) : '0',
    fee: doctor ? String((doctor.feeCents ?? 0) / CENTS_PER_UNIT) : '',
    bio: doctor ? doctor.bio || '' : '',
  });

  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);

  // Escape closes the dialog, which is what every keyboard user
  // expects of a modal.
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function update(field) {
    return (event) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
      setFieldErrors((current) => ({ ...current, [field]: undefined }));
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const feeNumber = Number(form.fee);
    if (!Number.isFinite(feeNumber) || feeNumber < 0) {
      setFieldErrors({ fee: 'Enter a fee of 0 or more' });
      return;
    }

    setBusy(true);

    const payload = {
      name: form.name,
      phone: form.phone,
      specialtyId: form.specialtyId,
      qualification: form.qualification || undefined,
      experienceYears: Number(form.experienceYears || 0),
      feeCents: Math.round(feeNumber * CENTS_PER_UNIT),
      bio: form.bio || undefined,
    };

    try {
      if (isNew) {
        const result = await api.post('/api/admin/doctors', {
          ...payload,
          email: form.email,
        });
        onSaved(result.message);
      } else {
        const result = await api.patch(`/api/admin/doctors/${doctor.id}`, payload);
        onSaved(result.message);
      }
    } catch (apiError) {
      if (apiError.details) setFieldErrors(apiError.details);
      setError(apiError);
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      // Clicking the dark area closes, but a click inside the dialog
      // must not bubble up and close it.
      onClick={onClose}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="doctor-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal__head">
          <h2 id="doctor-dialog-title">{isNew ? 'Add a doctor' : 'Edit doctor'}</h2>
          <button type="button" className="btn btn--ghost btn--small" onClick={onClose}>
            Close
          </button>
        </div>

        <form className="form" onSubmit={handleSubmit} noValidate>
          <ErrorMessage error={error} onDismiss={() => setError(null)} />

          <Field
            label="Full name"
            name="name"
            value={form.name}
            onChange={update('name')}
            error={fieldErrors.name}
            required
            autoFocus
          />

          {isNew ? (
            <Field
              label="Email address"
              name="email"
              type="email"
              value={form.email}
              onChange={update('email')}
              error={fieldErrors.email}
              hint="They will use this to log in. Sign-in details are sent here."
              required
            />
          ) : (
            <div className="field">
              <label htmlFor="email">Email address</label>
              <input id="email" value={form.email} disabled readOnly />
              <span className="field__hint">
                The login address cannot be changed here.
              </span>
            </div>
          )}

          <Field
            label="Phone number"
            name="phone"
            type="tel"
            value={form.phone}
            onChange={update('phone')}
            error={fieldErrors.phone}
            required
          />

          <Field label="Specialty" name="specialtyId" error={fieldErrors.specialtyId} required>
            <select
              id="specialtyId"
              name="specialtyId"
              value={form.specialtyId}
              onChange={update('specialtyId')}
              required
            >
              <option value="">Choose a specialty</option>
              {specialties.map((specialty) => (
                <option key={specialty.id} value={specialty.id}>
                  {specialty.name}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Qualification"
            name="qualification"
            value={form.qualification}
            onChange={update('qualification')}
            error={fieldErrors.qualification}
            placeholder="e.g. MBBS, MD"
          />

          <div className="form__row">
            <Field
              label="Years of experience"
              name="experienceYears"
              type="number"
              min="0"
              max="70"
              value={form.experienceYears}
              onChange={update('experienceYears')}
              error={fieldErrors.experienceYears}
            />
            <Field
              label={`Consultation fee (${CURRENCY_SYMBOL})`}
              name="fee"
              type="number"
              min="0"
              step="0.01"
              value={form.fee}
              onChange={update('fee')}
              error={fieldErrors.fee || fieldErrors.feeCents}
              required
            />
          </div>

          <Field label="About" name="bio" error={fieldErrors.bio}>
            <textarea
              id="bio"
              name="bio"
              rows={4}
              value={form.bio}
              onChange={update('bio')}
              maxLength={2000}
            />
          </Field>

          {isNew ? (
            <div className="demo-note">
              A password is generated automatically and emailed to the doctor - you will
              not see it. With MAIL_MODE=console it is printed in the backend terminal.
            </div>
          ) : null}

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
              {busy ? <Spinner label="Saving" /> : isNew ? 'Add doctor' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
