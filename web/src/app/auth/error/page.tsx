export default function AuthErrorPage() {
  return (
    <div className="container" style={{ textAlign: 'center', paddingTop: 80 }}>
      <h2 style={{ marginBottom: 12 }}>Sign-in failed</h2>
      <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
        Something went wrong during Google sign-in.
      </p>
      <a href="/"><button className="btn-primary">Back to Home</button></a>
    </div>
  );
}
