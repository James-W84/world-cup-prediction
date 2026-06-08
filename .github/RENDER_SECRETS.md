Required GitHub repository secrets for the Render deploy workflow

- `RENDER_API_KEY`: A Render API key with permission to create deploys. Create or view keys at https://dashboard.render.com/account/api-keys.
- `RENDER_SERVICE_ID_WEB`: The Render service ID for the frontend (web) service. Find it on the service's Settings → General page in the Render dashboard (the numeric ID in the URL or API section).
- `RENDER_SERVICE_ID_API`: The Render service ID for the backend (api) service.

If any of these secrets are missing, the workflow now fails with a clear error message before attempting the deploy.

Optional / notes:
- You will still need to configure all runtime environment variables (DATABASE_URL, GOOGLE_CLIENT_ID, etc.) in Render's service settings or keep them where they are currently configured in `render.yaml`.
- The workflow triggers on pushes to the `master` branch. Change the branch in `.github/workflows/deploy-to-render.yml` if you'd like a different trigger.

How to add secrets:
1. In GitHub, go to your repository → Settings → Secrets and variables.
2. If you want to use the environment named `deployment`, add the secrets under the environment:
   - `deployment` → Secrets and variables → Actions
   - Add `RENDER_API_KEY`, `RENDER_SERVICE_ID_WEB`, and `RENDER_SERVICE_ID_API` there.
3. If you prefer repository-wide secrets instead, add them under "Repository secrets" instead.

Important:
- Environment secrets are only exposed to a job if the job specifies `environment: deployment`.
- The workflow is now configured to use the `deployment` environment.

How the workflow works:
- The Action POSTs to `https://api.render.com/v1/services/{serviceId}/deploys` to create a deploy for the specified commit SHA and then polls the deploy status until success or timeout.
