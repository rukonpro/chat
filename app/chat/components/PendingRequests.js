'use client';
import { useState, useEffect } from 'react';

const PendingRequests = ({ pendingRequests, token, fetchData, setPendingRequests, setError, socket }) => {
    const [processing, setProcessing] = useState(null);

    // Listen for socket events related to friend requests
    useEffect(() => {
        if (!socket) return;

        // Listen for accepted friend requests
        const handleFriendRequestAccepted = ({ requestId, senderId, friendship }) => {
            setProcessing(null); // Clear processing state
            setPendingRequests((prev) => prev.filter((req) => req.id !== requestId));
        };

        // Listen for rejected friend requests
        const handleFriendRequestRejected = ({ requestId }) => {
            setProcessing(null); // Clear processing state
            setPendingRequests((prev) => prev.filter((req) => req.id !== requestId));
        };

        socket.on('friendRequestAccepted', handleFriendRequestAccepted);
        socket.on('friendRequestRejected', handleFriendRequestRejected);

        return () => {
            socket.off('friendRequestAccepted', handleFriendRequestAccepted);
            socket.off('friendRequestRejected', handleFriendRequestRejected);
        };
    }, [socket, setPendingRequests]);

    const acceptFriendRequest = (requestId, senderId, receiverId) => {
        if (!socket || !socket.connected) {
            setError('Not connected to server');
            return;
        }

        setProcessing(requestId);
        console.log(`Accepting friend request ${requestId}`);

        // Emit the acceptFriendRequest event with all required parameters
        socket.emit('acceptFriendRequest', {
            requestId,
            senderId,
            receiverId
        });

        // Set a timeout to clear the processing state in case of no response
        setTimeout(() => {
            if (processing === requestId) {
                setProcessing(null);
                setError('Accept request timed out');
            }
        }, 5000);
    };

    const rejectFriendRequest = (requestId) => {
        if (!socket || !socket.connected) {
            setError('Not connected to server');
            return;
        }

        setProcessing(requestId);
        console.log(`Rejecting friend request ${requestId}`);

        // Emit the rejectFriendRequest event
        socket.emit('rejectFriendRequest', { requestId });

        // Set a timeout to clear the processing state in case of no response
        setTimeout(() => {
            if (processing === requestId) {
                setProcessing(null);
                setError('Reject request timed out');
            }
        }, 5000);
    };

    return (
        <div className="p-2 sm:p-4">
            <h2 className="text-base sm:text-lg font-semibold mb-2">Pending Requests</h2>
            {pendingRequests.length > 0 ? (
                pendingRequests.map((req) => (
                    <div
                        key={req.id}
                        className="flex justify-between items-center p-2 bg-gray-50 rounded mb-2"
                    >
                        <span className="text-sm sm:text-base">{req.sender.name || 'Unnamed'}</span>
                        <div className="flex space-x-1 sm:space-x-2">
                            <button
                                onClick={() => acceptFriendRequest(req.id, req.sender.id, req.receiver.id)}
                                disabled={processing === req.id}
                                className={`px-2 py-1 rounded text-xs sm:text-sm ${
                                    processing === req.id
                                        ? 'bg-gray-400 cursor-not-allowed'
                                        : 'bg-green-500 hover:bg-green-600'
                                } text-white`}
                            >
                                {processing === req.id ? 'Processing...' : 'Accept'}
                            </button>
                            <button
                                onClick={() => rejectFriendRequest(req.id)}
                                disabled={processing === req.id}
                                className={`px-2 py-1 rounded text-xs sm:text-sm ${
                                    processing === req.id
                                        ? 'bg-gray-400 cursor-not-allowed'
                                        : 'bg-red-500 hover:bg-red-600'
                                } text-white`}
                            >
                                {processing === req.id ? 'Processing...' : 'Reject'}
                            </button>
                        </div>
                    </div>
                ))
            ) : (
                <p className="text-sm sm:text-base text-gray-500">No pending requests</p>
            )}
        </div>
    );
};

export default PendingRequests;
