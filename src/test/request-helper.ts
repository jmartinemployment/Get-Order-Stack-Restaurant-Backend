import supertest from 'supertest';
import app from '../app/app';
import { tokens, authHeader } from './auth-helper';

/**
 * Create a supertest agent wrapping the Express app.
 * Does NOT start a real server — supertest handles that internally.
 */
export function request() {
  return supertest(app);
}

/**
 * Convenience methods with pre-applied auth headers for each role.
 */
export const api = {
  /** Unauthenticated request */
  anonymous: () => supertest(app),

  /** Authenticated as super_admin */
  superAdmin: {
    get: (url: string) => supertest(app).get(url).set(authHeader(tokens.superAdmin)),
    post: (url: string) => supertest(app).post(url).set(authHeader(tokens.superAdmin)),
    patch: (url: string) => supertest(app).patch(url).set(authHeader(tokens.superAdmin)),
    put: (url: string) => supertest(app).put(url).set(authHeader(tokens.superAdmin)),
    delete: (url: string) => supertest(app).delete(url).set(authHeader(tokens.superAdmin)),
  },

  /** Authenticated as owner */
  owner: {
    get: (url: string) => supertest(app).get(url).set(authHeader(tokens.owner)),
    post: (url: string) => supertest(app).post(url).set(authHeader(tokens.owner)),
    patch: (url: string) => supertest(app).patch(url).set(authHeader(tokens.owner)),
    put: (url: string) => supertest(app).put(url).set(authHeader(tokens.owner)),
    delete: (url: string) => supertest(app).delete(url).set(authHeader(tokens.owner)),
  },

  /** Authenticated as manager */
  manager: {
    get: (url: string) => supertest(app).get(url).set(authHeader(tokens.manager)),
    post: (url: string) => supertest(app).post(url).set(authHeader(tokens.manager)),
    patch: (url: string) => supertest(app).patch(url).set(authHeader(tokens.manager)),
    put: (url: string) => supertest(app).put(url).set(authHeader(tokens.owner)),
    delete: (url: string) => supertest(app).delete(url).set(authHeader(tokens.manager)),
  },

  /** Authenticated as staff */
  staff: {
    get: (url: string) => supertest(app).get(url).set(authHeader(tokens.staff)),
    post: (url: string) => supertest(app).post(url).set(authHeader(tokens.staff)),
    patch: (url: string) => supertest(app).patch(url).set(authHeader(tokens.staff)),
    put: (url: string) => supertest(app).put(url).set(authHeader(tokens.staff)),
    delete: (url: string) => supertest(app).delete(url).set(authHeader(tokens.staff)),
  },
};
