// src/pages/auth/LoginPage.jsx

import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, homePathForRole } from '../../auth/AuthContext.jsx';
import { Field, ErrorMessage, Spinner } from '../../components/ui.jsx';
import './AuthPages.css';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Where the user was heading before being bounced to the login page,
  // set by RequireAuth. Falls back to their role's dashboard.
  const goingTo = location.state && location.state.from ? location.state.from.pathname : null;

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const user = await login(email, password);
      navigate(goingTo || homePathForRole(user.role), { replace: true });
    } catch (apiError) {
      // The backend deliberately returns the same message for a wrong
      // password, an unknown email and a deactivated account, so that
      // this form cannot be used to find out who has an account here.
      setError(apiError);
      setBusy(false);
    }
  }

  return (
    <div className="page page--narrow auth-page">
      <div className="card auth-card">
        <h1>Log in</h1>
        <p className="muted">Welcome back. Enter your details to continue.</p>

        {goingTo ? (
          <p className="auth-page__note small">
            Log in to continue to <code>{goingTo}</code>
          </p>
        ) : null}

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
            // Focus the first field on load so you can start typing.
            autoFocus
          />

          <Field
            label="Password"
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            // Tells a password manager this is a sign-in, not a new
            // password, so it offers to fill rather than to save.
            autoComplete="current-password"
          />

          <button type="submit" className="btn btn--block" disabled={busy}>
            {busy ? <Spinner label="Logging in" /> : 'Log in'}
          </button>
        </form>

        <div className="auth-card__links">
          <Link to="/forgot-password">Forgot your password?</Link>
          <span className="muted small">
            New here? <Link to="/register">Create an account</Link>
          </span>
        </div>
      </div>

      <DemoAccounts />
    </div>
  );
}

// A convenience panel for teaching: the seeded logins, one click to
// fill them in. It is plainly labelled as demo data.
//
// Obviously you would delete this before any real deployment - which is
// exactly the kind of thing worth pointing out to students, because
// "temporary" test shortcuts are a classic way for a backdoor to reach
// production.
function DemoAccounts() {
  const accounts = [
    { role: 'Patient', email: 'ravi@example.com' },
    { role: 'Doctor', email: 'asha.rao@medibook.local' },
    { role: 'Admin', email: 'admin@medibook.local' },
  ];

  function fill(email) {
    // Setting the DOM value directly and firing an input event is the
    // simplest way to drive React's controlled inputs from outside.
    for (const [name, value] of [
      ['email', email],
      ['password', 'ClinicDemo#2026'],
    ]) {
      const input = document.querySelector(`#${name}`);
      if (!input) continue;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      ).set;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  return (
    <div className="card auth-demo">
      <h2 className="auth-demo__title">Demo accounts</h2>
      <p className="small muted">
        This app is seeded with fake data. All demo accounts use the password{' '}
        <code>ClinicDemo#2026</code>.
      </p>

      <ul className="auth-demo__list">
        {accounts.map((account) => (
          <li key={account.email}>
            <div>
              <span className="strong small">{account.role}</span>
              <br />
              <span className="muted small">{account.email}</span>
            </div>
            <button
              type="button"
              className="btn btn--secondary btn--small"
              onClick={() => fill(account.email)}
            >
              Use
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
