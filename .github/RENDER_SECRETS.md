# GitHub Secrets for Render Deploys

Add these secrets in **GitHub → Settings → Environments → deployment → Environment secrets**:

| Secret | Where to find it |
|--------|-----------------|
| `RENDER_DEPLOY_HOOK_API` | Render dashboard → `wc2026-api` → Settings → Deploy Hook |
| `RENDER_DEPLOY_HOOK_WEB` | Render dashboard → `wc2026-web` → Settings → Deploy Hook |

The deploy workflow fires the API hook first, then the web hook once the API job completes.
Only the service whose files changed will be redeployed (path filtering via `dorny/paths-filter`).
