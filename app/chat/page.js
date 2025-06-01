'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import io from 'socket.io-client';

// Import components
import FriendList from './components/FriendList';
import NonFriendList from './components/NonFriendList';
import MessageSection from './components/MessageSection';
import Notification from './components/Notification';
import Header from './components/Header';
import { SOCKET_URL } from './components/utils';

// Utility function to play notification sound
const playNotificationSound = () => {
    const audio = new Audio('/notification.mp3');
    audio.play().catch((e) => console.log('Error playing notification sound:', e));
};

// Main Component
export default function Chat() {
    const [socket, setSocket] = useState(null);
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const [friends, setFriends] = useState([]);
    const [nonFriends, setNonFriends] = useState([]);
    const [pendingRequests, setPendingRequests] = useState([]);
    const [pendingSentRequests, setPendingSentRequests] = useState([]);
    const [messages, setMessages] = useState([]);
    const [calls, setCalls] = useState([]);
    const [selectedFriendId, setSelectedFriendId] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('selectedFriendId') || null;
        }
        return null;
    });
    const [content, setContent] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [socketConnected, setSocketConnected] = useState(false);
    const [notificationDrawerOpen, setNotificationDrawerOpen] = useState(false);
    const [leftSidebarOpen, setLeftSidebarOpen] = useState(false);
    const [processing, setProcessing] = useState(null);
    const router = useRouter();
    const socketRef = useRef(null); // Persist socket instance

    const fetchData = useCallback(() => {
        if (!socket || !socket.connected) return;

        setLoading((prevLoading) => {
            if (!prevLoading) return true;
            return prevLoading;
        });

        socket.emit('getUsers');
        socket.emit('checkFriendRequests');
        socket.emit('checkSentFriendRequests');
    }, [socket]);

    const fetchMessages = useCallback(
        (friendId) => {
            if (!socket || !socket.connected || !friendId) return;
            socket.emit('getMessages', { friendId });
        },
        [socket]
    );

    const fetchCallHistory = useCallback(
        (friendId) => {
            if (!socket || !socket.connected || !friendId) return;
            socket.emit('getCallHistory', { friendId });
        },
        [socket]
    );

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('selectedFriendId');
        socket?.disconnect();
        router.push('/login');
    };

    // Initialize user and token
    useEffect(() => {
        const storedToken = localStorage.getItem('token');
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');

        if (!storedToken || !storedUser?.id) {
            setError('Please log in');
            router.push('/login');
            return;
        }

        setToken(storedToken);
        setUser(storedUser);
    }, [router]);

    // Initialize socket once
    useEffect(() => {
        if (!token || !user) return;

        console.log('Initializing socket for user:', user.id);

        const newSocket = io(SOCKET_URL, {
            auth: { token },
            reconnectionAttempts: 3,
            reconnectionDelay: 1000,
        });

        socketRef.current = newSocket;
        setSocket(newSocket);

        newSocket.on('connect', () => {
            console.log('Socket connected:', user.id);
            setSocketConnected(true);
            newSocket.emit('join', user.id);
            newSocket.emit('getUsers');
            newSocket.emit('checkFriendRequests');
            newSocket.emit('checkSentFriendRequests');
        });

        newSocket.on('connect_error', (err) => {
            console.log('Socket connect error:', err.message);
            setSocketConnected(false);
            setError('Failed to connect to real-time server');
        });

        newSocket.on('users', (users) => {
            setFriends(users.filter((user) => user.isFriend));
            setNonFriends(users.filter((user) => !user.isFriend));
            setLoading(false);
        });

        newSocket.on('messages', (messages) => {
            setMessages(messages);
        });

        newSocket.on('callHistory', (calls) => {
            console.log('Received callHistory:', calls);
            setCalls(calls);
        });

        newSocket.on('call-updated', ({ call }) => {
            console.log('Call updated:', call, 'selectedFriendId:', selectedFriendId);
            if (
                selectedFriendId &&
                (call.callerId === selectedFriendId || call.receiverId === selectedFriendId)
            ) {
                setCalls((prevCalls) => {
                    const existingCallIndex = prevCalls.findIndex((c) => c.id === call.id);
                    if (existingCallIndex !== -1) {
                        const updatedCalls = [...prevCalls];
                        updatedCalls[existingCallIndex] = call;
                        console.log('Updated calls:', updatedCalls);
                        return updatedCalls;
                    } else {
                        const newCalls = [...prevCalls, call];
                        console.log('Added new call:', newCalls);
                        return newCalls;
                    }
                });
            } else {
                console.log('Call not relevant for selected friend');
            }
        });

        newSocket.on('receiveMessage', (message) => {
            setMessages((prev) => {
                if (prev.some((msg) => msg.id === message.id)) return prev;
                if (message.senderId !== user.id) {
                    playNotificationSound();
                }
                return [...prev, message];
            });
        });

        newSocket.on('friendRequest', (request) => {
            setError(`New friend request from ${request.sender?.name || 'someone'}!`);
            playNotificationSound();
            if (!request.sender) {
                request.sender = {
                    id: request.senderId,
                    name: 'New Request',
                    email: '',
                };
                if (newSocket.connected) {
                    newSocket.emit('getUsers');
                    newSocket.emit('checkFriendRequests');
                    newSocket.emit('checkSentFriendRequests');
                }
            }
            setPendingRequests((prev) => {
                if (prev.some((req) => req.id === request.id)) return prev;
                return [...prev, request];
            });
        });

        newSocket.on('friendRequestAccepted', ({ requestId, senderId, friendship }) => {
            newSocket.emit('getUsers');
            if (selectedFriendId === senderId) {
                newSocket.emit('getMessages', { friendId: senderId });
                newSocket.emit('getCallHistory', { friendId: senderId });
            }
            playNotificationSound();
            setError('Friend request accepted!');
            setPendingRequests((prev) => prev.filter((req) => req.id !== requestId));
        });

        newSocket.on('friendRequestRejected', ({ requestId }) => {
            setPendingRequests((prev) => prev.filter((req) => req.id !== requestId));
        });

        newSocket.on('friendRequestCancelled', ({ requestId }) => {
            newSocket.emit('checkSentFriendRequests');
        });

        newSocket.on('friendshipCreated', ({ friendshipId, senderId }) => {
            newSocket.emit('getUsers');
            if (selectedFriendId === senderId) {
                newSocket.emit('getMessages', { friendId: senderId });
                newSocket.emit('getCallHistory', { friendId: senderId });
            }
            playNotificationSound();
            setError('New friendship created!');
        });

        newSocket.on('userStatus', ({ userId, isOnline }) => {
            setFriends((prev) =>
                prev.map((friend) =>
                    friend.id === userId ? { ...friend, isOnline } : friend
                )
            );
        });

        newSocket.on('friendRequests', (requests) => {
            setPendingRequests(requests);
        });

        newSocket.on('sentFriendRequests', (requests) => {
            setPendingSentRequests(requests);
        });

        newSocket.on('friendRequestError', ({ message }) => {
            setError(message);
        });

        newSocket.on('call-error', ({ message }) => {
            console.log('Call error received:', message);
            setError(message);
        });

        return () => {
            console.log('Cleaning up socket for user:', user.id);
            newSocket.off('users');
            newSocket.off('messages');
            newSocket.off('callHistory');
            newSocket.off('call-updated');
            newSocket.off('receiveMessage');
            newSocket.off('friendRequest');
            newSocket.off('friendRequests');
            newSocket.off('sentFriendRequests');
            newSocket.off('friendRequestAccepted');
            newSocket.off('friendRequestRejected');
            newSocket.off('friendRequestCancelled');
            newSocket.off('friendshipCreated');
            newSocket.off('userStatus');
            newSocket.off('friendRequestError');
            newSocket.off('call-error');
            newSocket.disconnect();
        };
    }, [token, user]);

    // Handle friend-specific actions
    useEffect(() => {
        if (selectedFriendId && socket && socketConnected) {
            console.log('Fetching data for friend:', selectedFriendId);
            socket.emit('getMessages', { friendId: selectedFriendId });
            socket.emit('getCallHistory', { friendId: selectedFriendId });
            localStorage.setItem('selectedFriendId', selectedFriendId);
        }
    }, [selectedFriendId, socket, socketConnected]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center text-sky-500">
                Loading...
            </div>
        );
    }

    return (
        <div className="h-screen bg-gray-100 flex flex-col overflow-hidden">
            <Header
                user={user}
                socketConnected={socketConnected}
                pendingRequests={pendingRequests}
                setNotificationDrawerOpen={setNotificationDrawerOpen}
                notificationDrawerOpen={notificationDrawerOpen}
                setLeftSidebarOpen={setLeftSidebarOpen}
                leftSidebarOpen={leftSidebarOpen}
                handleLogout={handleLogout}
            />

            <div className="flex flex-row flex-1 overflow-hidden">
                <aside className="hidden md:block w-80 bg-white border-r border-sky-500 overflow-y-auto">
                    <FriendList
                        friends={friends}
                        selectedFriendId={selectedFriendId}
                        setSelectedFriendId={setSelectedFriendId}
                        token={token}
                        setError={setError}
                        fetchData={fetchData}
                        socket={socket}
                    />
                    <NonFriendList
                        nonFriends={nonFriends}
                        pendingSentRequests={pendingSentRequests}
                        token={token}
                        setError={setError}
                        fetchData={fetchData}
                        setPendingSentRequests={setPendingSentRequests}
                        socket={socket}
                    />
                </aside>

                <div className="flex-1 flex justify-center">
                    {!selectedFriendId && (
                        <div className="md:hidden w-full bg-white overflow-y-auto">
                            <FriendList
                                friends={friends}
                                selectedFriendId={selectedFriendId}
                                setSelectedFriendId={setSelectedFriendId}
                                token={token}
                                setError={setError}
                                fetchData={fetchData}
                                socket={socket}
                            />
                            <NonFriendList
                                nonFriends={nonFriends}
                                pendingSentRequests={pendingSentRequests}
                                token={token}
                                setError={setError}
                                fetchData={fetchData}
                                setPendingSentRequests={setPendingSentRequests}
                                socket={socket}
                            />
                        </div>
                    )}
                    <MessageSection
                        messages={messages}
                        calls={calls}
                        userId={user?.id}
                        selectedFriendId={selectedFriendId}
                        friends={friends}
                        content={content}
                        setContent={setContent}
                        socket={socket}
                        setSelectedFriendId={setSelectedFriendId}
                        className={!selectedFriendId ? 'hidden md:flex' : 'flex'}
                    />
                </div>

                <aside className="hidden lg:block w-80 bg-white border-l border-sky-500 overflow-y-auto">
                    <Notification
                        pendingRequests={pendingRequests}
                        token={token}
                        setError={setError}
                        fetchData={fetchData}
                        setPendingRequests={setPendingRequests}
                        processing={processing}
                        setProcessing={setProcessing}
                        socket={socket}
                    />
                </aside>
            </div>

            {error && (
                <div className="fixed top-4 right-4 bg-sky-500 text-white p-3 rounded-lg flex items-center space-x-2 shadow-lg z-50">
                    <span>{error}</span>
                    <button
                        onClick={() => setError('')}
                        className="bg-white text-sky-500 px-2 py-1 rounded ml-2"
                    >
                        Close
                    </button>
                </div>
            )}

            {notificationDrawerOpen && (
                <Notification
                    pendingRequests={pendingRequests}
                    token={token}
                    setError={setError}
                    fetchData={fetchData}
                    setPendingRequests={setPendingRequests}
                    setNotificationDrawerOpen={setNotificationDrawerOpen}
                    notificationDrawerOpen={notificationDrawerOpen}
                    processing={processing}
                    setProcessing={setProcessing}
                    socket={socket}
                    isMobile={true}
                />
            )}

            {leftSidebarOpen && (
                <div
                    className="md:hidden bg-white w-full sm:w-80 shadow-lg overflow-y-auto absolute top-[116px] sm:top-[72px] left-0 z-50"
                    style={{ height: 'calc(100vh - 64px)' }}
                >
                    <div className="p-4 bg-sky-100 text-sky-500 flex justify-between items-center">
                        <h2 className="text-lg font-semibold">Menu</h2>
                        <button
                            onClick={() => setLeftSidebarOpen(false)}
                            className="text-sky-500 hover:text-sky-200"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-6 w-6"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            </svg>
                        </button>
                    </div>
                    <NonFriendList
                        nonFriends={nonFriends}
                        pendingSentRequests={pendingSentRequests}
                        token={token}
                        setError={setError}
                        fetchData={fetchData}
                        setPendingSentRequests={setPendingSentRequests}
                        socket={socket}
                    />
                    <FriendList
                        friends={friends}
                        selectedFriendId={selectedFriendId}
                        setSelectedFriendId={setSelectedFriendId}
                        token={token}
                        setError={setError}
                        fetchData={fetchData}
                        socket={socket}
                    />
                </div>
            )}
        </div>
    );
}