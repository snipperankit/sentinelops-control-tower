(async () => {
  const session = process.argv[2];
  if (!session) {
    console.error('session id required');
    process.exit(2);
  }
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`http://localhost:8810/api/incidents/${session}`);
      if (!res.ok) {
        console.error('fetch failed', res.status);
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      const view = await res.json();
      console.error('attempt', i + 1, 'state', view.state);
      if (view.state === 'awaiting_approval') {
        console.log(JSON.stringify(view));
        process.exit(0);
      }
    } catch (e) {
      console.error('err', String(e));
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.error('timeout');
  process.exit(3);
})();
