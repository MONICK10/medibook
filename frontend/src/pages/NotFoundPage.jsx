// src/pages/NotFoundPage.jsx

import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import './StatusPages.css';

export default function NotFoundPage() {
  const { isLoggedIn, role } = useAuth();
  const location = useLocation();

  return (
    <div className="page status-page">
      <div className="card status-card">
        <p className="status-card__code">404</p>
        <h1>Page not found</h1>
        <p className="muted">
          There is nothing at <code>{location.pathname}</code>. The link may be out of
          date, or there may be a typo in the address.
        </p>

        <div className="row">
          {isLoggedIn ? (
            <Link to={`/${role}`} className="btn">
              Go to my dashboard
            </Link>
          ) : (
            <Link to="/" className="btn">
              Go to the home page
            </Link>
          )}
          {/* A plain history step back, for when they followed a bad
              link from inside the app. */}
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => window.history.back()}
          >
            Go back
          </button>
        </div>
      </div>
    </div>
  );
}
