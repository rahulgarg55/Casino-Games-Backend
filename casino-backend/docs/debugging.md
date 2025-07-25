# Debugging Memory Leaks and Performance Issues in Node.js

This guide explains how to analyze and debug memory usage and performance issues in the casino-backend project using **clinic.js**, **Chrome DevTools**, and **heapdump**.

---

## 1. Using clinic.js

### Install clinic.js

Install globally (recommended):

```bash
npm install -g clinic
```

### Run the Application with clinic.js

For TypeScript projects (using ts-node):

```bash
npm run start:clinic
```

Or manually:

```bash
clinic doctor -- ts-node src/server.ts
```

### Steps:
1. Start the app with the above command.
2. Interact with your app (or run tests) to reproduce the issue.
3. Press `Ctrl+C` to stop.
4. Open the generated report:
   ```bash
   clinic open
   ```

---

## 2. Using Chrome DevTools (Remote Debugging)

### Start Node.js with Inspect Flag

Add this script to `package.json` (already present if you followed setup):

```json
"start:inspect": "node --inspect src/server.ts"
```

Or run manually:

```bash
node --inspect src/server.ts
```

### Steps:
1. Open `chrome://inspect` in Chrome.
2. Click "Open dedicated DevTools for Node".
3. Take heap snapshots and profile memory.

---

## 3. Using heapdump

### Install heapdump

```bash
npm install heapdump --save-dev
```

### Trigger Heap Snapshots (Development Only)

Add this to `src/app.ts` (or a dev-only route file):

```js
if (process.env.NODE_ENV !== 'production') {
  const heapdump = require('heapdump');
  const path = require('path');
  app.get('/debug/heapdump', (req, res) => {
    const filename = path.join(__dirname, `../heapdump-${Date.now()}.heapsnapshot`);
    heapdump.writeSnapshot(filename, (err, filename) => {
      if (err) return res.status(500).send('Heapdump failed');
      res.send(`Heapdump written to ${filename}`);
    });
  });
}
```

- Visit `/debug/heapdump` to generate a snapshot.
- Download and open it in Chrome DevTools (Memory tab).

---

## 4. Best Practices
- Only enable heapdump/debug routes in development.
- Never expose debug endpoints in production.
- Always analyze heap snapshots and reports locally.

---

## References
- [clinic.js documentation](https://clinicjs.org/)
- [Node.js Debugging Guide](https://nodejs.org/en/docs/guides/debugging-getting-started/)
- [Chrome DevTools for Node.js](https://nodejs.org/en/docs/guides/debugging-getting-started/#chrome-devtools) 