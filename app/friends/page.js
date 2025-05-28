"use client"
import React, {useEffect, useState} from 'react';
import {useRouter} from "next/navigation";
import { io } from 'socket.io-client';
import Image from 'next/image';

const Friends = () => {
    const [error, setError] = useState('');
    const [token, setToken] = useState(null);
    const [friends, setFriends] = useState([]);
    const [loading, setLoading] = useState(false);
    const [user, setUser] = useState(null);
    const [socket, setSocket] = useState(null);
    const router = useRouter();

    useEffect(() => {
        // Load login data
        const storedToken = localStorage.getItem('token');
        const storedUser = JSON.parse(localStorage.getItem('user'));

        if (!storedToken || !storedUser?.id) {
            setError('Please login');
            router.push('/login');
            return;
        }

        setToken(storedToken);
        setUser(storedUser);

        // Initialize socket connection
        const socketInstance = io('http://localhost:3000', {
            auth: { token: storedToken }
        });

        setSocket(socketInstance);

        // Clean up socket connection on unmount
        return () => {
            socketInstance.disconnect();
        };
    },[router]);

    // Listen for unfriend events
    useEffect(() => {
        if (!socket || !user) return;

        // Join user's room
        socket.emit('join', user.id);

        // Listen for unfriended events
        socket.on('unfriended', ({ userId }) => {
            console.log('Unfriended event received', userId);
            setFriends(prevFriends => prevFriends.filter(friend => friend.id !== userId));
        });

        return () => {
            socket.off('unfriended');
        };
    }, [socket, user]);

    useEffect(() => {
        // Fetch friend list
        const fetchFriends = async () => {
            if (!token) return;
            setLoading(true);
            try {
                const res = await fetch('http://localhost:3000/api/user', {
                    headers: { Authorization: `Bearer ${token}` },
                });


                if (!res.ok) throw new Error('Failed to fetch friends');
                const users = await res.json();
                console.log(users);
                setFriends(users.filter((user) => user.isFriend));
            } catch (err) {
                console.log(err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchFriends()
    }, [token]);
    const handleUnfriend = async (friendId) => {
        if (!token) return;
        try {
            const res = await fetch('http://localhost:3000/api/friendship/unfriend', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ friendId }),
            });

            if (!res.ok) throw new Error('Unfriend failed');

            // Update the friends list by removing the unfriended user
            setFriends(friends.filter((friend) => friend.id !== friendId));
        } catch (err) {
            console.error(err);
            setError(err.message);
        }
    };

    return (
        <div className="container mx-auto p-4">
            <h1 className="text-2xl font-bold mb-4">Friends</h1>

            {error && <div className="text-red-500 mb-4">{error}</div>}

            {loading ? (
                <div>Loading...</div>
            ) : friends.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {friends.map((friend) => (
                        <div key={friend.id} className="border rounded-lg p-4 flex items-center justify-between">
                            <div className="flex items-center">
                                {friend.profilePic ? (
                                    <Image 
                                        src={friend.profilePic} 
                                        alt={friend.name} 
                                        width={40}
                                        height={40}
                                        className="rounded-full mr-3"
                                    />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-gray-300 mr-3 flex items-center justify-center">
                                        {friend.name?.charAt(0) || friend.email.charAt(0)}
                                    </div>
                                )}
                                <div>
                                    <h3 className="font-medium">{friend.name || 'No Name'}</h3>
                                    <p className="text-sm text-gray-500">{friend.email}</p>
                                    <span className={`text-xs ${friend.isOnline ? 'text-green-500' : 'text-gray-400'}`}>
                                        {friend.isOnline ? 'Online' : 'Offline'}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={() => handleUnfriend(friend.id)}
                                className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md text-sm"
                            >
                                Unfriend
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-8">
                    <p className="text-gray-500">You don&apos;t have any friends yet.</p>
                </div>
            )}
        </div>
    );
};

export default Friends;
