import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
    const server = createServer((req, res) => {
        const parsedUrl = parse(req.url, true);
        handle(req, res, parsedUrl); // Handles all Next.js routes (including API)
    });

    // Dynamically import the socket module
    const { initSocket } = await import('./lib/socket.js');
    initSocket(server); // Initialize Socket.IO server

    const port = process.env.PORT || 3000; // Port 3000
    server.listen(port, (err) => {
        if (err) throw err;
        console.log(`> Server running on http://localhost:${port}`);
    });
});
