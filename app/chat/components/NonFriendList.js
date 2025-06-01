'use client';
import { useState, useEffect } from 'react';

const NonFriendList = ({ nonFriends, pendingSentRequests, token, setError, fetchData, setPendingSentRequests, socket }) => {
    const [sending, setSending] = useState(null);
    const [canceling, setCanceling] = useState(null);

    // Listen for socket events related to friend requests
    useEffect(() => {
        if (!socket) return;

        // Listen for sent friend requests
        const handleFriendRequestSent = (request) => {
            setSending(null); // Clear sending state
            setPendingSentRequests((prev) => {
                if (prev.some((req) => req.id === request.id)) return prev;
                return [...prev, request];
            });
        };

        // Listen for canceled friend requests - ensure this matches socket.js
        const handleFriendRequestCancelled = ({ requestId }) => {
            setCanceling(null); // Clear canceling state
            setPendingSentRequests((prev) => prev.filter((req) => req.id !== requestId));
        };

        // Listen for friend request errors
        const handleFriendRequestError = ({ message }) => {
            setSending(null); // Clear sending state
            setCanceling(null); // Clear canceling state
            setError(message);
        };

        socket.on('friendRequestSent', handleFriendRequestSent);
        socket.on('friendRequestCancelled', handleFriendRequestCancelled); // Updated to match backend
        socket.on('friendRequestError', handleFriendRequestError);

        return () => {
            socket.off('friendRequestSent', handleFriendRequestSent);
            socket.off('friendRequestCancelled', handleFriendRequestCancelled); // Updated to match backend
            socket.off('friendRequestError', handleFriendRequestError);
        };
    }, [socket, setPendingSentRequests, setError]);

    const sendFriendRequest = (receiverId) => {
        // Check if a request is already pending
        if (pendingSentRequests.some((req) => req.receiverId === receiverId)) {
            setError('Friend request already sent to this user');
            return;
        }

        // Check socket connection
        if (!socket) {
            setError('Socket not initialized');
            return;
        }
        
        if (!socket.connected) {
            setError('Not connected to server. Please refresh the page.');
            return;
        }

        setSending(receiverId);
        console.log(`Sending friend request to ${receiverId}`);

        // Emit the sendFriendRequest event with just the receiverId
        socket.emit('sendFriendRequest', { receiverId });

        // Set a timeout to clear the sending state in case of no response
        setTimeout(() => {
            if (sending === receiverId) {
                setSending(null);
                setError('Friend request timed out. Please try again.');
            }
        }, 5000);
    };

    const cancelFriendRequest = (requestId) => {
        if (!socket || !socket.connected) {
            setError('Not connected to server');
            return;
        }

        setCanceling(requestId);
        console.log(`Canceling friend request ${requestId}`);

        // Emit the cancelFriendRequest event - ensure this matches socket.js handler
        socket.emit('cancelFriendRequest', { requestId });

        // Set a timeout to clear the canceling state in case of no response
        setTimeout(() => {
            if (canceling === requestId) {
                setCanceling(null);
                setError('Cancel request timed out');
            }
        }, 5000);
    };

    return (
        <div className="p-2 sm:p-4">
            <h2 className="text-base sm:text-lg font-semibold mb-2 text-black">Add New Friends</h2>
            {nonFriends.length > 0 ? (
                nonFriends.map((user) => {
                    const pendingRequest = pendingSentRequests.find((req) => req.receiverId === user.id);
                    const isPending = !!pendingRequest;
                    return (
                        <div
                            key={user.id}
                            className="p-2 sm:p-3 rounded mb-2 flex items-center justify-between bg-gray-50 hover:bg-gray-100"
                        >
                            <div className="flex items-center space-x-2">
                                <div className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full ${user.isOnline ? 'bg-green-500' : 'bg-gray-500'}`} />
                                <span className="text-sm sm:text-base text-black">{user.name || 'Unnamed'}</span>
                            </div>
                            {isPending ? (
                                <button
                                    onClick={() => cancelFriendRequest(pendingRequest.id)}
                                    disabled={canceling === pendingRequest.id}
                                    className={`px-2 sm:px-3 py-1 rounded text-xs sm:text-sm ${
                                        canceling === pendingRequest.id
                                            ? 'bg-gray-400 cursor-not-allowed'
                                            : 'bg-red-500 hover:bg-red-600'
                                    } text-white`}
                                >
                                    {canceling === pendingRequest.id ? 'Canceling...' : 'Cancel'}
                                </button>
                            ) : (
                                <button
                                    onClick={() => sendFriendRequest(user.id)}
                                    disabled={sending === user.id}
                                    className={`px-2 sm:px-3 py-1 rounded text-xs sm:text-sm ${
                                        sending === user.id
                                            ? 'bg-gray-400 cursor-not-allowed'
                                            : 'bg-sky-500 hover:bg-sky-600'
                                    } text-white`}
                                >
                                    {sending === user.id ? 'Sending...' : 'Send'}
                                </button>
                            )}
                        </div>
                    );
                })
            ) : (
                <p className="text-gray-500">No new users found</p>
            )}
        </div>
    );
};

export default NonFriendList;
