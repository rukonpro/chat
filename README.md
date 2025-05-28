# Chat Application Deployment Guide

## Socket.IO Configuration for Vercel

This Next.js application uses Socket.IO for real-time communication. The application is configured to use the same URL for both the frontend and Socket.IO server: `https://chat-rukon.vercel.app`.

## How It Works

The application is built with Next.js and uses a custom server setup (server.js) that:

1. Serves the Next.js application
2. Initializes a Socket.IO server on the same server

This approach allows us to use the same URL for both the frontend and Socket.IO server, simplifying the deployment process.

## Deployment on Vercel

When deploying to Vercel, the application will automatically use the correct URL for Socket.IO connections:

- In development: `http://localhost:3000`
- In production: `https://chat-rukon.vercel.app`

### Important Configuration

The Socket.IO URL is configured in `app/chat/components/utils.js`:

```javascript
// If no environment variable is set, use a fallback
if (!SOCKET_URL) {
  if (typeof window !== 'undefined' && window.location.hostname === 'chat-rukon.vercel.app') {
    // Using the same URL for both frontend and Socket.IO server
    SOCKET_URL = 'https://chat-rukon.vercel.app';
  } else {
    // For local development
    SOCKET_URL = 'http://localhost:3000';
  }
}
```

## Environment Variables

You can optionally set the following environment variables in your Vercel project settings:

- `NEXT_PUBLIC_SOCKET_URL`: Override the Socket.IO server URL if needed
- `NEXT_PUBLIC_API_URL`: Override the API URL if needed

## Local Development

For local development:

1. Run `npm run dev` to start the development server
2. The application will use `http://localhost:3000` for both the API and Socket.IO server

## Troubleshooting

If you're experiencing issues with Socket.IO connections:

1. Check that your server.js file is properly configured to initialize Socket.IO
2. Verify that the Socket.IO client in your application is connecting to the correct URL
3. Check the browser console for any connection errors
4. Make sure your Vercel deployment is using the latest version of your code

### Common Issues

- **404 errors for Socket.IO endpoints**: Make sure your server.js file is being used by Vercel. Check your package.json to ensure the start script is set to `node server.js`.
- **CORS errors**: If you're seeing CORS errors, make sure your Socket.IO server is configured to allow connections from your frontend domain.