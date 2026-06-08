Required GitHub repository secrets for the Render deploy workflow

- `RENDER_API_KEY`: A Render API key with permission to create deploys. Create or view keys at https://dashboard.render.com/account/api-keys.
- `RENDER_SERVICE_ID_WEB`: The Render service ID for the frontend (web) service. Find it on the service's Settings → General page in the Render dashboard (the numeric ID in the URL or API section).
- `RENDER_SERVICE_ID_API`: The Render service ID for the backend (api) service.

Optional / notes:
- You will still need to configure all runtime environment variables (DATABASE_URL, GOOGLE_CLIENT_ID, etc.) in Render's service settings or keep them where they are currently configured in `render.yaml`.
- The workflow triggers on pushes to the `master` branch. Change the branch in `.github/workflows/deploy-to-render.yml` if you'd like a different trigger.

How to add secrets:
1. In GitHub, go to your repository → Settings → Secrets and variables → Actions.
2. Click "New repository secret" and add the keys above with their values.

How the workflow works:
- The Action POSTs to `https://api.render.com/v1/services/{serviceId}/deploys` to create a deploy for the specified commit SHA and then polls the deploy status until success or timeout.
