const crypto = require('crypto');

const COOKIE_NAME = 'napkin_auth';
const AUTH_VALUE = 'authorized';

function json(statusCode, payload, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extraHeaders
    },
    body: JSON.stringify(payload)
  };
}

function readCookies(headerValue = '') {
  return headerValue.split(';').reduce((cookies, part) => {
    const [name, ...rest] = part.trim().split('=');
    if (!name) return cookies;
    cookies[name] = rest.join('=');
    return cookies;
  }, {});
}

function authSecret(password) {
  return process.env.NAPKIN_AUTH_SECRET || password;
}

function signValue(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function expectedCookieValue(password) {
  return `v1.${signValue(AUTH_VALUE, authSecret(password))}`;
}

function isValidCookie(rawValue, password) {
  if (!rawValue || !password) return false;
  const expected = expectedCookieValue(password);
  const actual = Buffer.from(rawValue);
  const target = Buffer.from(expected);
  return actual.length === target.length && crypto.timingSafeEqual(actual, target);
}

function matchesPassword(input, password) {
  if (typeof input !== 'string' || !password) return false;
  const actual = Buffer.from(input);
  const target = Buffer.from(password);
  return actual.length === target.length && crypto.timingSafeEqual(actual, target);
}

function buildCookie(value, event) {
  const headers = event.headers || {};
  const secure = (headers['x-forwarded-proto'] || '').toLowerCase() === 'https' ? '; Secure' : '';
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=43200`;
}

exports.handler = async (event) => {
  const password = process.env.NAPKIN_PASSWORD || process.env.NAPKIN_BETA_PASSWORD;
  if (!password) {
    return json(500, { error: 'Password not configured' });
  }

  const headers = event.headers || {};
  const cookies = readCookies(headers.cookie || headers.Cookie || '');

  if (event.httpMethod === 'GET') {
    return json(200, { authenticated: isValidCookie(cookies[COOKIE_NAME], password) });
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method Not Allowed' });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    if (!matchesPassword(body.password, password)) {
      return json(401, { authenticated: false, error: 'Invalid password' });
    }

    return json(
      200,
      { authenticated: true },
      { 'Set-Cookie': buildCookie(expectedCookieValue(password), event) }
    );
  } catch (_) {
    return json(400, { error: 'Invalid request body' });
  }
};
