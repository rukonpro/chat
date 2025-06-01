'use client';
import {useEffect, useState} from 'react';
import Image from 'next/image';

const FriendList = ({ friends, selectedFriendId, setSelectedFriendId, token, setError, fetchData, socket }) => {
    const [openMenuId, setOpenMenuId] = useState(null);
    const [unfriending, setUnfriending] = useState(null);

    const handleMenuClick = (e, friendId) => {
        e.stopPropagation();
        setOpenMenuId(openMenuId === friendId ? null : friendId);
    };

    const handleUnfriend = (e, friendId) => {
        e.stopPropagation();
        setOpenMenuId(null);
        
        if (!socket || !socket.connected) {
            setError('Not connected to server');
            return;
        }
        
        setUnfriending(friendId);
        console.log(`Unfriending user ${friendId}`);

        // Emit unfriend event
        socket.emit('unfriend', { friendId });

        // Set a timeout to clear the unfriending state in case of no response
        setTimeout(() => {
            if (unfriending === friendId) {
                setUnfriending(null);
                setError('Unfriend request timed out');
            }
        }, 5000);
    };

    useEffect(() => {
        if (!socket) return;

        const handleUnfriended = ({ userId }) => {
            console.log(`Unfriended user ${userId}`);
            setUnfriending(null);
            fetchData(); // Refresh the friends list
        };

        const handleError = ({ message }) => {
            console.error(`Socket error: ${message}`);
            setUnfriending(null);
            setError(message);
        };

        socket.on('unfriended', handleUnfriended);
        socket.on('error', handleError);

        return () => {
            socket.off('unfriended', handleUnfriended);
            socket.off('error', handleError);
        };
    }, [socket, fetchData, setError]);

    return (
        <div className="p-2 sm:p-4">
            <h2 className="text-base sm:text-lg text-black font-semibold mb-2">Friends</h2>
            {friends.length > 0 ? (
                friends.map((friend) => (
                    <div
                        key={friend.id}
                        className={`p-2 sm:p-3 rounded mb-2 cursor-pointer flex items-center justify-between ${
                            selectedFriendId === friend.id ? 'bg-sky-100' : 'bg-gray-50'
                        } hover:bg-sky-50 relative`}
                    >
                        <div 
                            className="flex items-center space-x-2 flex-grow"
                            onClick={() => setSelectedFriendId(friend.id)}
                        >
                            <div className="relative">
                                {friend.profilePic ? (
                                    <div className="relative w-8 h-8 sm:w-10 sm:h-10 rounded-full overflow-hidden">
                                        <Image 
                                            src={friend.profilePic} 
                                            alt={friend.name || 'Friend'} 
                                            width={40} 
                                            height={40} 
                                            className="object-cover"
                                        />
                                        {friend.isOnline ? (
                                            <span className="absolute bottom-0 right-0 flex size-3">
                                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75"></span>
                                                <span className="relative inline-flex size-3 rounded-full bg-sky-500"></span>
                                            </span>
                                        ):
                                        (
                                            <span className="absolute bottom-0 right-0 flex size-3">
                                                <span className="absolute inline-flex h-full w-full  rounded-full bg-gray-400 opacity-75"></span>
                                                <span className="relative inline-flex size-3 rounded-full bg-gray-500"></span>
                                            </span>
                                        )}
                                    </div>
                                ) : (
                                    <div className="relative w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gray-200 flex items-center justify-center">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                                        </svg>
                                        {friend.isOnline ? (
                                            <span className="absolute bottom-0 right-0 flex size-3">
                                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75"></span>
                                                <span className="relative inline-flex size-3 rounded-full bg-sky-500"></span>
                                            </span>
                                        ):
                                            (
                                                <span className="absolute bottom-0 right-0 flex size-3">
                                                <span className="absolute inline-flex h-full w-full  rounded-full bg-gray-400 opacity-75"></span>
                                                <span className="relative inline-flex size-3 rounded-full bg-gray-500"></span>
                                            </span>
                                            )
                                        }
                                    </div>
                                )}
                            </div>
                            <span className="text-sm sm:text-base text-black">{friend.name || 'Unnamed'}</span>
                        </div>

                        {unfriending === friend.id ? (
                            <div className="text-sm text-gray-500">Unfriending...</div>
                        ) : (
                            <div className="relative">
                                <button 
                                    className="p-1 text-gray-500 hover:text-gray-700 focus:outline-none"
                                    onClick={(e) => handleMenuClick(e, friend.id)}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                                    </svg>
                                </button>

                                {openMenuId === friend.id && (
                                    <div className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg z-10 border border-gray-200">
                                        <div className="py-1">
                                            <button
                                                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                                                onClick={(e) => handleUnfriend(e, friend.id)}
                                            >
                                                Unfriend
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))
            ) : (
                <p className="text-gray-500">No friends found</p>
            )}
        </div>
    );
};

export default FriendList;
