require('module-alias/register');
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { initSocket } = require('@/lib/socket');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    const server = createServer((req, res) => {
        const parsedUrl = parse(req.url, true);
        handle(req, res, parsedUrl); // Next.js এর সব রাউট (API সহ) হ্যান্ডল করে
    });

    initSocket(server); // Socket.IO সার্ভার ইনিশিয়ালাইজ

    const port = process.env.PORT || 3000; // পোর্ট ৩০০১
    server.listen(port, (err) => {
        if (err) throw err;
        console.log(`> Server running on http://localhost:${port}`);
    });
});