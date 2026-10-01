// src/pages/shared/ProfilePage.jsx
// -----------------------------------------------------------------
// One profile page for all three roles.
//
//   * everyone: name, phone, change password
//   * doctors also: bio, fee, qualification, years of experience
//
// The email address is shown but not editable. It is the login
// identity, so changing it safely means proving the new address works
// first (a confirmation link) and keeping the old one until then.
// Without that flow, a stolen session could quietly take over an
// account by pointing password resets somewhere else. The backend
// leaves the field out for the same reason.
// -----------------------------------------------------------------

import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import {
  Field,
  Message,
  ErrorMessage,
  LoadingArea,
  Spinner,
  formatMoney,
} from '../../components/ui.jsx';
import { CENTS_PER_UNIT, CURRENCY_SYMBOL } from '../../config.js';
import './ProfilePage.css';

export default function ProfilePage() {
  const { user, updateUser, role } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [doctor, setDoctor] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const result = await api.get('/api/profile');
        if (cancelled) return;
        updateUser(result.user);
        setDoctor(result.doctor || null);
      } catch (error) {
        if (!cancelled) setLoadError(error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // updateUser is stable (useCallback), so this runs once.
  }, [updateUser]);

  if (loading) return <LoadingArea label="Loading your profile..." />;

  return (
    <div className="page page--narrow profile-page">
      <div className="page-head">
        <div>
          <h1>My profile</h1>
          <p>Your details and password.</p>
        </div>
      </div>

      <ErrorMessage error={loadError} onDismiss={() => setLoadError(null)} />

      <div className="stack">
        <DetailsCard user={user} onSaved={updateUser} />

        {role === 'doctor' && doctor ? (
          <DoctorProfileCard doctor={doctor} onSaved={setDoctor} />
        ) : null}

        <PasswordCard />
      </div>
    </div>
  );
}

// ---------- name, email, phone ----------
function DetailsCard({ user, onSaved }) {
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone || '');
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const changed = name !== user.name || phone !== (user.phone || '');

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setSaved(false);
    setBusy(true);

    try {
      const result = await api.patch('/api/profile', { name, phone });
      onSaved(result.user);
      setSaved(true);
    } catch (apiError) {
      if (apiError.details) setFieldErrors(apiError.details);
      setError(apiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="card__head">
        <h2>Your details</h2>
      </div>

      <form className="form" onSubmit={handleSubmit} noValidate>
        {saved ? <Message type="success" text="Your details have been saved." /> : null}
        <ErrorMessage error={error} onDismiss={() => setError(null)} />

        <Field
          label="Full name"
          name="name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setSaved(false);
          }}
          error={fieldErrors.name}
          required
          autoComplete="name"
        />

        <div className="field">
          <label htmlFor="email">Email address</label>
          <input id="email" value={user.email} disabled readOnly />
          <span className="field__hint">
            This is your login and cannot be changed here. Contact the clinic if you need
            it updated.
          </span>
        </div>

        <Field
          label="Phone number"
          name="phone"
          type="tel"
          value={phone}
          onChange={(event) => {
            setPhone(event.target.value);
            setSaved(false);
          }}
          error={fieldErrors.phone}
          hint="10 to 15 digits."
          required
          autoComplete="tel"
        />

        <div className="row row--end">
          {/* Disabled until something actually changes, so the button
              reflects whether there is anything to save. */}
          <button type="submit" className="btn" disabled={busy || !changed}>
            {busy ? <Spinner label="Saving" /> : 'Save details'}
          </button>
        </div>
      </form>
    </section>
  );
}

// ---------- doctor bio and fee ----------
function DoctorProfileCard({ doctor, onSaved }) {
  // The form holds rupees, the API wants paise. Converting at the edge
  // keeps whole-number money everywhere else.
  const [form, setForm] = useState({
    bio: doctor.bio || '',
    qualification: doctor.qualification || '',
    experienceYears: String(doctor.experienceYears ?? ''),
    fee: String((doctor.feeCents ?? 0) / CENTS_PER_UNIT),
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  function update(field) {
    return (event) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
      setFieldErrors((current) => ({ ...current, [field]: undefined }));
      setSaved(false);
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setBusy(true);

    const feeNumber = Number(form.fee);
    if (!Number.isFinite(feeNumber) || feeNumber < 0) {
      setFieldErrors({ fee: 'Enter a fee of 0 or more' });
      setBusy(false);
      return;
    }

    try {
      const result = await api.patch('/api/doctor/profile', {
        bio: form.bio,
        qualification: form.qualification,
        experienceYears: Number(form.experienceYears || 0),
        // Math.round, because 600.1 rupees would otherwise become
        // 60010.000000001 paise and the backend wants an integer.
        feeCents: Math.round(feeNumber * CENTS_PER_UNIT),
      });
      onSaved(result.doctor);
      setSaved(true);
    } catch (apiError) {
      if (apiError.details) setFieldErrors(apiError.details);
      setError(apiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="card__head">
        <h2>Doctor profile</h2>
        <span className="muted small">Shown to patients</span>
      </div>

      <form className="form" onSubmit={handleSubmit} noValidate>
        {saved ? <Message type="success" text="Your profile has been saved." /> : null}
        <ErrorMessage error={error} onDismiss={() => setError(null)} />

        <div className="field">
          <label htmlFor="specialty">Specialty</label>
          <input id="specialty" value={doctor.specialtyName || '-'} disabled readOnly />
          <span className="field__hint">
            Which department you belong to is set by the clinic administrator.
          </span>
        </div>

        <Field
          label="Qualification"
          name="qualification"
          value={form.qualification}
          onChange={update('qualification')}
          error={fieldErrors.qualification}
          placeholder="e.g. MBBS, MD (General Medicine)"
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
            hint={`Currently ${formatMoney(doctor.feeCents)}`}
          />
        </div>

        <Field
          label="About you"
          name="bio"
          error={fieldErrors.bio}
          hint="A short description patients will read when choosing a doctor."
        >
          <textarea
            id="bio"
            name="bio"
            rows={5}
            value={form.bio}
            onChange={update('bio')}
            maxLength={2000}
            aria-describedby="bio-hint"
          />
        </Field>

        <div className="row row--end">
          <button type="submit" className="btn" disabled={busy}>
            {busy ? <Spinner label="Saving" /> : 'Save profile'}
          </button>
        </div>
      </form>
    </section>
  );
}

// ---------- change password ----------
function PasswordCard() {
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [rules, setRules] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get('/api/auth/password-rules', { auth: false })
      .then((result) => setRules(result.rules))
      .catch(() => {});
  }, []);

  function update(field) {
    return (event) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
      setFieldErrors((current) => ({ ...current, [field]: undefined }));
      setSaved(false);
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    if (form.newPassword !== form.confirmPassword) {
      setFieldErrors({ confirmPassword: 'The two passwords do not match' });
      return;
    }

    setBusy(true);

    try {
      await api.post('/api/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setSaved(true);
    } catch (apiError) {
      if (apiError.details) setFieldErrors(apiError.details);
      setError(apiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="card__head">
        <h2>Change password</h2>
      </div>

      <form className="form" onSubmit={handleSubmit} noValidate>
        {saved ? <Message type="success" text="Your password has been changed." /> : null}
        <ErrorMessage error={error} onDismiss={() => setError(null)} />

        {/* The current password is required even though you are already
            logged in, so a stolen session alone cannot lock the real
            owner out of their account. */}
        <Field
          label="Current password"
          name="currentPassword"
          type="password"
          value={form.currentPassword}
          onChange={update('currentPassword')}
          error={fieldErrors.currentPassword}
          required
          autoComplete="current-password"
        />

        <Field
          label="New password"
          name="newPassword"
          type="password"
          value={form.newPassword}
          onChange={update('newPassword')}
          error={fieldErrors.newPassword}
          required
          autoComplete="new-password"
        />

        {rules.length > 0 ? (
          <ul className="profile-page__rules">
            {rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        ) : null}

        <Field
          label="Confirm new password"
          name="confirmPassword"
          type="password"
          value={form.confirmPassword}
          onChange={update('confirmPassword')}
          error={fieldErrors.confirmPassword}
          required
          autoComplete="new-password"
        />

        <div className="row row--end">
          <button type="submit" className="btn" disabled={busy}>
            {busy ? <Spinner label="Saving" /> : 'Change password'}
          </button>
        </div>
      </form>
    </section>
  );
}
