# Chat Application Deployment Guide

## Issue: Socket.IO on Vercel

The application was experiencing issues with Socket.IO connections when deployed to Vercel. This is because Vercel uses a serverless architecture that doesn't support long-running HTTP servers with Socket.IO attached.

## Solution

The solution is to use a separate Socket.IO server hosted on a platform that supports WebSockets and persistent connections, such as Heroku, Railway, or similar services.

## Deployment Steps

### 1. Deploy the Socket.IO Server

You need to deploy the Socket.IO server to a platform that supports WebSockets. Here's how to do it with Heroku:

1. Create a new repository for your Socket.IO server
2. Create a basic server.js file:

```javascript
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS || "*",
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Copy your Socket.IO logic from lib/socket.js here
// You'll need to adapt it to work with your database

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});
```

3. Create a package.json file:

```json
{
  "name": "chat-socketio-server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.8.1",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "@prisma/client": "^6.8.2"
  }
}
```

4. Deploy this server to Heroku or another platform that supports WebSockets

### 2. Update the Vercel Environment Variables

In your Vercel project settings, add the following environment variable:

- `NEXT_PUBLIC_SOCKET_URL`: Set this to your Socket.IO server URL (e.g., `https://your-app-name.herokuapp.com`)

### 3. Update Your Code

The code has been updated to use the Socket.IO server URL from the environment variable or to detect when running on Vercel and use a separate Socket.IO server.

In `app/chat/components/utils.js`, replace the placeholder URL with your actual Socket.IO server URL:

```javascript
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 
  (typeof window !== 'undefined' && window.location.hostname === 'chat-rukon.vercel.app' 
    ? 'https://your-actual-socketio-server.herokuapp.com' // Replace with your actual Socket.IO server URL
    : 'http://localhost:3000');
```

### 4. Redeploy Your Application

After making these changes, redeploy your application to Vercel.

## Local Development

For local development, the application will continue to use `http://localhost:3000` for both the API and Socket.IO server.

## Troubleshooting

If you're still experiencing issues:

1. Check that your Socket.IO server is running and accessible
2. Verify that CORS is properly configured on your Socket.IO server
3. Check the browser console for any connection errors
4. Make sure your environment variables are correctly set in Vercel