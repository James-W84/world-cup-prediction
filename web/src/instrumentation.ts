export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NODE_ENV !== 'production') return;

  const apiUrl = process.env.API_INTERNAL_URL;
  if (!apiUrl) return;

  // Fire-and-forget: don't block server startup, just kick off the warmup
  warmUpApi(apiUrl).catch(() => {});
}

async function warmUpApi(apiUrl: string, maxAttempts = 20, delayMs = 3000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${apiUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        console.log(`[warmup] API ready after ${attempt} attempt(s)`);
        return;
      }
    } catch {
      // keep retrying
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  console.warn('[warmup] API did not respond after all warmup attempts');
}
