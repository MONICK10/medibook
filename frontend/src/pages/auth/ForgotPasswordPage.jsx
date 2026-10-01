// src/pages/auth/ForgotPasswordPage.jsx

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { Field, ErrorMessage, Message, Spinner } from '../../components/ui.jsx';
import './AuthPages.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      await api.post('/api/auth/forgot-password', { email }, { auth: false });
      // The backend gives the same answer whether or not the account
      // exists, so this page cannot be used to test a list of email
      // addresses against the clinic. We show the same thing.
      setSent(true);
    } catch (apiError) {
      setError(apiError);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="page page--narrow auth-page">
        <div className="card auth-card">
          <h1>Check your email</h1>

          <Message
            type="success"
            text="If that email address has an account, a reset link is on its way."
          />

          <p className="muted">
            The link is valid for 30 minutes. If it does not arrive, check the address
            and try again.
          </p>

          {/* The local-mode shortcut, spelled out: with
              MAIL_MODE=console the backend prints the email instead of
              sending it. Without this note a student waits for an email
              that is never coming. */}
          <div className="demo-note">
            <strong>Running this locally?</strong> No email is actually sent. Look at the
            terminal window running the backend - the whole message, including the reset
            link, is printed there.
          </div>

          <div className="auth-card__links">
            <Link to="/login">Back to log in</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page page--narrow auth-page">
      <div className="card auth-card">
        <h1>Forgot your password?</h1>
        <p className="muted">
          Enter your email address and we will send you a link to set a new one.
        </p>

        <form className="form" onSubmit={handleSubmit} noValidate>
          <ErrorMessage error={error} onDismiss={() => setError(null)} />

          <Field
            label="Email address"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            autoFocus
          />

          <button type="submit" className="btn btn--block" disabled={busy}>
            {busy ? <Spinner label="Sending" /> : 'Send reset link'}
          </button>
        </form>

        <div className="auth-card__links">
          <Link to="/login">Back to log in</Link>
        </div>
      </div>
    </div>
  );
}
