// lib/validate.js
// -----------------------------------------------------------------
// A tiny schema validator, used as Express middleware.
//
// WHY validate on the backend when the form already checks things:
// the form is a convenience for honest users. Anyone can send a request
// with curl or Postman and skip the form entirely. The backend is the
// only place a rule is actually enforced.
//
// It also STRIPS unknown fields. If a request body contains
// { name: "A", role: "admin" } and the schema only allows `name`, the
// role is dropped. That blocks "mass assignment": a patient promoting
// themselves to admin by adding a field the frontend never sends.
// -----------------------------------------------------------------

const { unprocessable } = require('./httpError');
const time = require('./time');
const { checkPasswordStrength } = require('./password');

// Each checker returns { value } on success or { error: 'message' }.
const checkers = {
  string(raw, spec) {
    if (typeof raw !== 'string') return { error: 'must be text' };
    const value = spec.trim === false ? raw : raw.trim();
    if (spec.min !== undefined && value.length < spec.min) {
      return { error: `must be at least ${spec.min} characters` };
    }
    if (spec.max !== undefined && value.length > spec.max) {
      return { error: `must be ${spec.max} characters or fewer` };
    }
    if (spec.pattern && !spec.pattern.test(value)) {
      return { error: spec.patternMessage || 'is not in the expected format' };
    }
    return { value };
  },

  email(raw) {
    if (typeof raw !== 'string') return { error: 'must be text' };
    const value = raw.trim().toLowerCase(); // stored lowercase so logins are case-insensitive
    if (value.length > 254) return { error: 'is too long' };
    // Deliberately loose. Strict RFC email regexes reject valid addresses;
    // the only real proof an address works is sending mail to it.
    if (!/^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(value)) {
      return { error: 'must be a valid email address' };
    }
    return { value };
  },

  phone(raw) {
    if (typeof raw !== 'string') return { error: 'must be text' };
    // Keep digits and a leading +, drop spaces, dashes and brackets so
    // "+91 98765 43210" and "9876543210" both work.
    const value = raw.trim().replace(/(?!^\+)[^\d]/g, '');
    if (!/^\+?\d{10,15}$/.test(value)) {
      return { error: 'must be 10 to 15 digits' };
    }
    return { value };
  },

  password(raw, spec, field, body) {
    if (typeof raw !== 'string') return { error: 'must be text' };
    const result = checkPasswordStrength(raw, { email: body && body.email, name: body && body.name });
    if (!result.ok) return { error: result.message };
    return { value: raw }; // never trimmed: spaces are legal characters
  },

  enum(raw, spec) {
    if (!spec.values.includes(raw)) {
      return { error: `must be one of: ${spec.values.join(', ')}` };
    }
    return { value: raw };
  },

  date(raw) {
    if (!time.isValidDateString(raw)) {
      return { error: 'must be a real date in YYYY-MM-DD format' };
    }
    return { value: raw };
  },

  time(raw) {
    if (!time.isValidTimeString(raw)) {
      return { error: 'must be a time in 24-hour HH:MM format' };
    }
    return { value: raw };
  },

  int(raw, spec) {
    // Query strings always arrive as text, so accept "5" as well as 5.
    const value = typeof raw === 'number' ? raw : Number(String(raw).trim());
    if (!Number.isInteger(value)) return { error: 'must be a whole number' };
    if (spec.min !== undefined && value < spec.min) {
      return { error: `must be ${spec.min} or more` };
    }
    if (spec.max !== undefined && value > spec.max) {
      return { error: `must be ${spec.max} or less` };
    }
    return { value };
  },

  boolean(raw) {
    if (typeof raw === 'boolean') return { value: raw };
    const text = String(raw).trim().toLowerCase();
    if (['true', '1', 'yes'].includes(text)) return { value: true };
    if (['false', '0', 'no'].includes(text)) return { value: false };
    return { error: 'must be true or false' };
  },

  id(raw) {
    if (typeof raw !== 'string') return { error: 'must be text' };
    const value = raw.trim();
    // Our ids are UUIDs. Checking the shape stops junk reaching the store
    // and makes SQL injection attempts in an id fail here.
    if (!/^[0-9a-fA-F-]{36}$/.test(value)) return { error: 'is not a valid id' };
    return { value };
  },

  array(raw, spec, field, body) {
    if (!Array.isArray(raw)) return { error: 'must be a list' };
    if (spec.min !== undefined && raw.length < spec.min) {
      return { error: `must have at least ${spec.min} item(s)` };
    }
    if (spec.max !== undefined && raw.length > spec.max) {
      return { error: `must have ${spec.max} item(s) or fewer` };
    }
    if (!spec.of) return { value: raw };

    const value = [];
    const errors = {};
    raw.forEach((item, index) => {
      if (spec.of.fields) {
        const result = runSchema(spec.of.fields, item || {});
        if (result.errors) {
          for (const [key, message] of Object.entries(result.errors)) {
            errors[`${field}[${index}].${key}`] = message;
          }
        } else {
          value.push(result.value);
        }
      } else {
        const check = checkers[spec.of.type];
        const result = check(item, spec.of, field, body);
        if (result.error) errors[`${field}[${index}]`] = result.error;
        else value.push(result.value);
      }
    });

    if (Object.keys(errors).length > 0) return { nestedErrors: errors };
    return { value };
  },
};

// Validate one plain object against a schema. Returns { value } or { errors }.
function runSchema(schema, input) {
  const value = {};
  const errors = {};

  for (const [field, spec] of Object.entries(schema)) {
    const raw = input[field];
    const isMissing = raw === undefined || raw === null || raw === '';

    if (isMissing) {
      if (spec.required) {
        errors[field] = 'is required';
      } else if (spec.default !== undefined) {
        value[field] = spec.default;
      }
      continue;
    }

    const check = checkers[spec.type];
    if (!check) throw new Error(`Unknown validator type "${spec.type}" for field "${field}"`);

    const result = check(raw, spec, field, input);
    if (result.nestedErrors) Object.assign(errors, result.nestedErrors);
    else if (result.error) errors[field] = result.error;
    else value[field] = result.value;
  }

  if (Object.keys(errors).length > 0) return { errors };
  return { value };
}

// Build middleware that validates one part of the request.
// The cleaned result is put on req.valid - routes read req.valid, never
// req.body, so an unvalidated field cannot reach the database by accident.
function validate(schema, source = 'body') {
  return function validateMiddleware(req, res, next) {
    const input = source === 'query' ? req.query : source === 'params' ? req.params : req.body;
    const result = runSchema(schema, input || {});

    if (result.errors) {
      return next(
        unprocessable('Please check the highlighted fields.', result.errors)
      );
    }

    // Merge so a route can validate params and body and read both.
    req.valid = { ...(req.valid || {}), ...result.value };
    next();
  };
}

module.exports = { validate, runSchema };
