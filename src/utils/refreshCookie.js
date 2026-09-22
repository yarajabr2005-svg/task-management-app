export const REFRESH_COOKIE_NAME = 'refresh_token';

const refreshCookieMaxAge = 7 * 24 * 60 * 60 * 1000;

export const refreshCookieOptions = Object.freeze({
  httpOnly: true,
  sameSite: process.env.COOKIE_SAME_SITE?.trim() || 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/api/v1/auth',
  maxAge: refreshCookieMaxAge,
});

export function setRefreshTokenCookie(response, refreshToken) {
  response.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions);
}

export function clearRefreshTokenCookie(response) {
  response.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions);
}