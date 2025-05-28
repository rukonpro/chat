import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';

// Graceful shutdown function
const gracefulShutdown = (server, exitCode = 0) => {
    console.log('Shutting down server gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(exitCode);
    });

    // Force close after 10s
    setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
};

// Error handling for uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Don't exit immediately as we might have an active server
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit immediately as we might have an active server
});

// Handle termination signals
process.on('SIGTERM', () => {
    console.log('SIGTERM received');
    if (global.server) gracefulShutdown(global.server);
});

process.on('SIGINT', () => {
    console.log('SIGINT received');
    if (global.server) gracefulShutdown(global.server);
});

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare()
    .then(async () => {
        try {
            const server = createServer((req, res) => {
                try {
                    const parsedUrl = parse(req.url, true);
                    handle(req, res, parsedUrl); // Handles all Next.js routes (including API)
                } catch (error) {
                    console.error('Error handling request:', error);
                    res.statusCode = 500;
                    res.end('Internal Server Error');
                }
            });

            // Store server in global for graceful shutdown
            global.server = server;

            // Handle server errors
            server.on('error', (error) => {
                console.error('Server error:', error);
                gracefulShutdown(server, 1);
            });

            // Dynamically import the socket module
            const { initSocket } = await import('./lib/socket.js');
            initSocket(server); // Initialize Socket.IO server

            const port = process.env.PORT || 3000; // Port 3000
            server.listen(port, (err) => {
                if (err) {
                    console.error('Error starting server:', err);
                    return gracefulShutdown(server, 1);
                }
                console.log(`> Server running on http://localhost:${port}`);
            });
        } catch (error) {
            console.error('Error in server setup:', error);
            process.exit(1);
        }
    })
    .catch((error) => {
        console.error('Error preparing Next.js app:', error);
        process.exit(1);
    });
