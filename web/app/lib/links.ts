// External links surfaced to reviewers. The API docs (Swagger UI) and Sidekiq
// dashboard live on the API origin — public and stable, so the URL is hardcoded
// rather than threaded through env config.
export const REPO_URL = "https://github.com/chairulakmal/karirkalyan";
export const API_BASE_URL = "https://api-production-4899.up.railway.app";
export const API_DOCS_URL = `${API_BASE_URL}/api-docs`;
export const SIDEKIQ_URL = `${API_BASE_URL}/sidekiq`;
