// src/components/Layout.jsx
// -----------------------------------------------------------------
// The header, navigation and footer that wrap every page.
//
// The navigation is built from the logged-in user's ROLE, so each
// person sees only their own menu. Again: this is about not showing
// people dead ends, not about security.
// -----------------------------------------------------------------

import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { CLINIC_NAME } from '../config.js';
import './Layout.css';

// One menu per role. Adding a role later means adding one entry here
// and one in the backend's permission table.
const NAV_BY_ROLE = {
  patient: [
    { to: '/patient', label: 'Dashboard', end: true },
    { to: '/patient/doctors', label: 'Find a doctor' },
    { to: '/patient/appointments', label: 'Appointments' },
    { to: '/patient/reports', label: 'Reports' },
    { to: '/patient/prescriptions', label: 'Prescriptions' },
  ],
  doctor: [
    { to: '/doctor', label: 'Dashboard', end: true },
    { to: '/doctor/appointments', label: 'Appointments' },
    { to: '/doctor/patients', label: 'Patients' },
    { to: '/doctor/availability', label: 'My schedule' },
  ],
  admin: [
    { to: '/admin', label: 'Dashboard', end: true },
    { to: '/admin/doctors', label: 'Doctors' },
    { to: '/admin/specialties', label: 'Specialties' },
    { to: '/admin/appointments', label: 'Appointments' },
    { to: '/admin/users', label: 'Users' },
    { to: '/admin/audit-log', label: 'Audit log' },
  ],
};

const ROLE_LABELS = { patient: 'Patient', doctor: 'Doctor', admin: 'Administrator' };

export default function Layout() {
  const { user, isLoggedIn, logout, role } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu whenever the route changes, or it stays open
  // covering the page you just navigated to.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  const navItems = isLoggedIn ? NAV_BY_ROLE[role] || [] : [];

  async function handleLogout() {
    await logout();
    navigate('/', { replace: true });
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="site-header">
        <div className="site-header__inner">
          <Link to={isLoggedIn ? `/${role}` : '/'} className="brand">
            {/* An inline SVG rather than an icon font or an image: no
                extra request, and it scales cleanly. aria-hidden
                because the brand name next to it already says it. */}
            <svg
              className="brand__mark"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M12 21s-7.5-4.7-7.5-10A4.5 4.5 0 0 1 12 7.8 4.5 4.5 0 0 1 19.5 11c0 5.3-7.5 10-7.5 10z"
                fill="currentColor"
                opacity="0.18"
              />
              <path
                d="M12 10v5M9.5 12.5h5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M12 21s-7.5-4.7-7.5-10A4.5 4.5 0 0 1 12 7.8 4.5 4.5 0 0 1 19.5 11c0 5.3-7.5 10-7.5 10z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              />
            </svg>
            <span className="brand__name">{CLINIC_NAME}</span>
          </Link>

          {navItems.length > 0 ? (
            <button
              type="button"
              className="nav-toggle"
              aria-expanded={menuOpen}
              aria-controls="main-nav"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className="sr-only">{menuOpen ? 'Close menu' : 'Open menu'}</span>
              <span className="nav-toggle__bars" aria-hidden="true" />
            </button>
          ) : null}

          <nav
            id="main-nav"
            className={`site-nav ${menuOpen ? 'site-nav--open' : ''}`}
            aria-label="Main"
          >
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                // NavLink gives us isActive, which sets aria-current so
                // a screen reader also knows which page we are on.
                className={({ isActive }) =>
                  `site-nav__link ${isActive ? 'site-nav__link--active' : ''}`
                }
              >
                {item.label}
              </NavLink>
            ))}

            <div className="site-nav__account">
              {isLoggedIn ? (
                <>
                  <Link to={`/${role}/profile`} className="account">
                    <span className="account__name">{user.name}</span>
                    <span className="account__role">{ROLE_LABELS[role] || role}</span>
                  </Link>
                  <button
                    type="button"
                    className="btn btn--secondary btn--small"
                    onClick={handleLogout}
                  >
                    Log out
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" className="btn btn--secondary btn--small">
                    Log in
                  </Link>
                  <Link to="/register" className="btn btn--small">
                    Register
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      </header>

      {/* id="main" is the target of the skip link above. */}
      <main id="main">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="site-footer__inner">
          <div>
            <strong>{CLINIC_NAME}</strong>
            <p className="small muted">
              A demo healthcare booking application, built for teaching.
            </p>
          </div>

          <div className="site-footer__links">
            <Link to="/">Home</Link>
            {isLoggedIn ? (
              <Link to={`/${role}`}>Dashboard</Link>
            ) : (
              <Link to="/login">Log in</Link>
            )}
          </div>

          {/* Said plainly, on every page. Invented medical records
              should never be mistaken for real ones. */}
          <p className="small muted site-footer__note">
            All data in this application is invented. Do not enter real personal or
            medical information.
          </p>
        </div>
      </footer>
    </>
  );
}
