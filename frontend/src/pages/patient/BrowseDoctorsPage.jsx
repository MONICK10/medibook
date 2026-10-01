// src/pages/patient/BrowseDoctorsPage.jsx
// -----------------------------------------------------------------
// Find a doctor: filter by specialty, search by name.
//
// The filters live in the URL (?specialty=...&search=...), not just in
// React state. That means the Back button works, and a filtered list
// can be bookmarked or shared - which is free if you use the router's
// search params as the source of truth, and fiddly to add later.
// -----------------------------------------------------------------

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, queryString } from '../../api/client.js';
import {
  Empty,
  ErrorMessage,
  LoadingArea,
  formatMoney,
} from '../../components/ui.jsx';
import './PatientPages.css';

export default function BrowseDoctorsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const specialtyId = searchParams.get('specialty') || '';
  const search = searchParams.get('search') || '';

  // A separate copy for the text box, so typing does not fire a
  // request per keystroke. It is committed to the URL on submit.
  const [searchInput, setSearchInput] = useState(search);

  const [specialties, setSpecialties] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Keep the box in step if the URL changes from elsewhere (Back, or a
  // link from the landing page).
  useEffect(() => setSearchInput(search), [search]);

  useEffect(() => {
    api
      .get('/api/specialties')
      .then((result) => setSpecialties(result.specialties))
      .catch(() => {
        // The filter is a convenience; the list below still works.
      });
  }, []);

  useEffect(() => {
    // AbortController cancels the previous request when the filters
    // change again quickly. Without it, two responses can arrive out of
    // order and the slower, older one wins - the classic stale-results
    // bug in a search box.
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    api
      .get(`/api/doctors${queryString({ specialtyId, search, limit: 50 })}`, {
        signal: controller.signal,
      })
      .then((result) => {
        setDoctors(result.doctors);
        setLoading(false);
      })
      .catch((apiError) => {
        if (apiError.name === 'AbortError') return;
        setError(apiError);
        setLoading(false);
      });

    return () => controller.abort();
  }, [specialtyId, search]);

  function updateFilter(changes) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next, { replace: true });
  }

  const hasFilters = Boolean(specialtyId || search);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Find a doctor</h1>
          <p>Choose a specialty or search by name, then pick a free time.</p>
        </div>
      </div>

      {/* ---------- filters ---------- */}
      <section className="card browse-filters">
        <form
          className="filters"
          onSubmit={(event) => {
            event.preventDefault();
            updateFilter({ search: searchInput.trim() });
          }}
        >
          <div className="field">
            <label htmlFor="specialty">Specialty</label>
            <select
              id="specialty"
              value={specialtyId}
              onChange={(event) => updateFilter({ specialty: event.target.value })}
            >
              <option value="">All specialties</option>
              {specialties.map((specialty) => (
                <option key={specialty.id} value={specialty.id}>
                  {specialty.name} ({specialty.doctorCount})
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="search">Doctor&rsquo;s name</label>
            <input
              id="search"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="e.g. Rao"
            />
          </div>

          <div className="filters__actions">
            <button type="submit" className="btn">
              Search
            </button>
            {hasFilters ? (
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => {
                  setSearchInput('');
                  setSearchParams({}, { replace: true });
                }}
              >
                Clear
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <ErrorMessage error={error} onDismiss={() => setError(null)} />

      {/* ---------- results ---------- */}
      {loading ? (
        <LoadingArea label="Finding doctors..." />
      ) : doctors.length === 0 ? (
        <div className="card">
          <Empty title="No doctors found">
            <p className="small">
              {hasFilters
                ? 'Try a different specialty, or clear the filters.'
                : 'There are no doctors available at the moment.'}
            </p>
          </Empty>
        </div>
      ) : (
        <>
          <p className="muted small browse-count">
            {doctors.length} {doctors.length === 1 ? 'doctor' : 'doctors'}
            {specialtyId
              ? ` in ${
                  (specialties.find((s) => s.id === specialtyId) || {}).name || 'this specialty'
                }`
              : ''}
          </p>

          <div className="grid">
            {doctors.map((doctor) => (
              <article className="card doctor-card" key={doctor.id}>
                <div className="doctor-card__head">
                  <span className="doctor-card__initials" aria-hidden="true">
                    {initialsOf(doctor.name)}
                  </span>
                  <div>
                    <h2 className="doctor-card__name">{doctor.name}</h2>
                    <p className="muted small">{doctor.specialtyName}</p>
                  </div>
                </div>

                {doctor.qualification ? (
                  <p className="small muted doctor-card__qual">{doctor.qualification}</p>
                ) : null}

                <p className="small doctor-card__bio">{doctor.bio}</p>

                <dl className="doctor-card__facts">
                  <div>
                    <dt>Experience</dt>
                    <dd>{doctor.experienceYears} years</dd>
                  </div>
                  <div>
                    <dt>Fee</dt>
                    <dd>{formatMoney(doctor.feeCents)}</dd>
                  </div>
                </dl>

                <Link to={`/patient/doctors/${doctor.id}`} className="btn btn--small">
                  See times
                </Link>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function initialsOf(name) {
  return String(name)
    .replace(/^(Dr|Mr|Mrs|Ms|Prof)\.?\s+/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || '')
    .join('')
    .toUpperCase();
}
