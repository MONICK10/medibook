// src/pages/auth/ResetPasswordPage.jsx
// -----------------------------------------------------------------
// Reached from the link in the reset email:
//   /reset-password?token=...
//
// Note the user is NOT logged in automatically after a successful
// reset. Whoever opened the link has not yet typed the new password
// into a login form, and making them do so proves they know it.
// -----------------------------------------------------------------

import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { Field, ErrorMessage, Message, Spinner } from '../../components/ui.jsx';
import './AuthPages.css';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rules, setRules] = useState([]);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get('/api/auth/password-rules', { auth: false })
      .then((result) => setRules(result.rules))
      .catch(() => {});
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    if (password !== confirmPassword) {
      setFieldErrors({ confirmPassword: 'The two passwords do not match' });
      return;
    }

    setBusy(true);

    try {
      await api.post('/api/auth/reset-password', { token, password }, { auth: false });
      setDone(true);
    } catch (apiError) {
      if (apiError.details) setFieldErrors(apiError.details);
      setError(apiError);
    } finally {
      setBusy(false);
    }
  }

  // Someone opened /reset-password with no token at all.
  if (!token) {
    return (
      <div className="page page--narrow auth-page">
        <div className="card auth-card">
          <h1>Reset link needed</h1>
          <Message
            type="error"
            text="This page needs a reset link."
            detail="Open the link from your email, or request a new one."
          />
          <div className="auth-card__links">
            <Link to="/forgot-password">Request a new link</Link>
            <Link to="/login">Back to log in</Link>
          </div>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="page page--narrow auth-page">
        <div className="card auth-card">
          <h1>Password changed</h1>
          <Message type="success" text="Your password has been changed." />
          <p className="muted">You can now log in with your new password.</p>
          <button
            type="button"
            className="btn btn--block"
            onClick={() => navigate('/login', { replace: true })}
          >
            Go to log in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page page--narrow auth-page">
      <div className="card auth-card">
        <h1>Set a new password</h1>
        <p className="muted">Choose a password you have not used here before.</p>

        <form className="form" onSubmit={handleSubmit} noValidate>
          <ErrorMessage error={error} onDismiss={() => setError(null)} />

          <Field
            label="New password"
            name="password"
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setFieldErrors((current) => ({ ...current, password: undefined }));
            }}
            error={fieldErrors.password}
            required
            autoComplete="new-password"
            autoFocus
          />

          {rules.length > 0 ? (
            <ul className="auth-rules">
              {rules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          ) : null}

          <Field
            label="Confirm new password"
            name="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              setFieldErrors((current) => ({ ...current, confirmPassword: undefined }));
            }}
            error={fieldErrors.confirmPassword}
            required
            autoComplete="new-password"
          />

          <button type="submit" className="btn btn--block" disabled={busy}>
            {busy ? <Spinner label="Saving" /> : 'Change password'}
          </button>
        </form>

        <div className="auth-card__links">
          <Link to="/login">Back to log in</Link>
        </div>
      </div>
    </div>
  );
}
