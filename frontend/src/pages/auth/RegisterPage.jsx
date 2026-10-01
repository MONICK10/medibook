// src/pages/auth/RegisterPage.jsx
// -----------------------------------------------------------------
// Patient registration.
//
// Only patients can register themselves. Doctors are created by an
// admin, because a doctor account can read patient records - so if
// doctors could sign themselves up, anybody could. That rule is
// enforced in the backend, which hardcodes the role; there is no role
// field on this form for it to trust.
// -----------------------------------------------------------------

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useAuth, homePathForRole } from '../../auth/AuthContext.jsx';
import { Field, ErrorMessage, Spinner } from '../../components/ui.jsx';
import './AuthPages.css';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [rules, setRules] = useState([]);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);

  // The password rules come FROM the backend, so this form can never
  // show rules that disagree with the ones actually enforced.
  useEffect(() => {
    let cancelled = false;
    api
      .get('/api/auth/password-rules', { auth: false })
      .then((result) => {
        if (!cancelled) setRules(result.rules);
      })
      .catch(() => {
        // Not fatal: the backend will still explain any problem when
        // the form is submitted.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function update(field) {
    return (event) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
      // Clear this field's error as soon as it is edited: leaving a
      // stale error next to a field someone is fixing is maddening.
      setFieldErrors((current) => ({ ...current, [field]: undefined }));
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    // The only check done purely in the browser. The backend never
    // sees confirmPassword, because "did you type it twice" is about
    // catching a typo, not about security.
    if (form.password !== form.confirmPassword) {
      setFieldErrors({ confirmPassword: 'The two passwords do not match' });
      return;
    }

    setBusy(true);

    try {
      const user = await register({
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password,
      });
      navigate(homePathForRole(user.role), { replace: true });
    } catch (apiError) {
      // A 422 carries per-field messages from the backend validator.
      if (apiError.details) setFieldErrors(apiError.details);
      setError(apiError);
      setBusy(false);
    }
  }

  return (
    <div className="page page--narrow auth-page">
      <div className="card auth-card">
        <h1>Create an account</h1>
        <p className="muted">
          Registering is for patients. If you are a doctor, the clinic administrator will
          create your account.
        </p>

        <form className="form" onSubmit={handleSubmit} noValidate>
          <ErrorMessage error={error} onDismiss={() => setError(null)} />

          <Field
            label="Full name"
            name="name"
            value={form.name}
            onChange={update('name')}
            error={fieldErrors.name}
            required
            autoComplete="name"
            autoFocus
          />

          <Field
            label="Email address"
            name="email"
            type="email"
            value={form.email}
            onChange={update('email')}
            error={fieldErrors.email}
            hint="You will use this to log in."
            required
            autoComplete="email"
          />

          <Field
            label="Phone number"
            name="phone"
            type="tel"
            value={form.phone}
            onChange={update('phone')}
            error={fieldErrors.phone}
            hint="10 to 15 digits. The clinic uses this to contact you."
            required
            autoComplete="tel"
          />

          <Field
            label="Password"
            name="password"
            type="password"
            value={form.password}
            onChange={update('password')}
            error={fieldErrors.password}
            required
            autoComplete="new-password"
          />

          {rules.length > 0 ? (
            <ul className="auth-rules">
              {rules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          ) : null}

          <Field
            label="Confirm password"
            name="confirmPassword"
            type="password"
            value={form.confirmPassword}
            onChange={update('confirmPassword')}
            error={fieldErrors.confirmPassword}
            required
            autoComplete="new-password"
          />

          <p className="small muted">
            Please use invented details. This is a demo application and the data in it is
            not private.
          </p>

          <button type="submit" className="btn btn--block" disabled={busy}>
            {busy ? <Spinner label="Creating your account" /> : 'Create account'}
          </button>
        </form>

        <div className="auth-card__links">
          <span className="muted small">
            Already registered? <Link to="/login">Log in</Link>
          </span>
        </div>
      </div>
    </div>
  );
}
