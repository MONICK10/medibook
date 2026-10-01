// src/pages/AccessDeniedPage.jsx
// -----------------------------------------------------------------
// Shown when someone is logged in but not allowed somewhere: the 403
// case, as opposed to 404 (no such page) or the login page (401).
//
// WHY this is a separate page from the login page: being sent back to
// log in when you are already logged in is a dead end - you sign in
// again, land in the same place, and get bounced again. Saying "your
// account cannot do this" is the only honest answer.
// -----------------------------------------------------------------

import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import './StatusPages.css';

const ROLE_LABELS = { patient: 'patient', doctor: 'doctor', admin: 'administrator' };

export default function AccessDeniedPage() {
  const { isLoggedIn, role, user } = useAuth();
  const location = useLocation();

  const attempted = location.state && location.state.from ? location.state.from.pathname : null;

  return (
    <div className="page status-page">
      <div className="card status-card">
        <p className="status-card__code status-card__code--warn">403</p>
        <h1>Access denied</h1>

        {isLoggedIn ? (
          <>
            <p className="muted">
              You are logged in as <strong>{user.name}</strong>, a{' '}
              {ROLE_LABELS[role] || role} account. That page is not available for your
              account type.
            </p>
            {attempted ? (
              <p className="small muted">
                You tried to open <code>{attempted}</code>.
              </p>
            ) : null}

            {/* The important bit for a student reading this: the page
                being hidden is not what protects it. */}
            <div className="demo-note status-card__note">
              The backend refuses this too. Hiding a page in the browser only avoids
              confusion; the permission check that matters happens on the server, which
              nobody can edit from here.
            </div>

            <div className="row">
              <Link to={`/${role}`} className="btn">
                Go to my dashboard
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="muted">You need to log in to see that page.</p>
            <div className="row">
              <Link to="/login" className="btn">
                Log in
              </Link>
              <Link to="/" className="btn btn--secondary">
                Home
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
