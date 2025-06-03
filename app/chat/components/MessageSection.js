'use client';
import { useEffect, useRef, useMemo, useState } from 'react';
import Image from 'next/image';
import CallModal from './CallModal';

const MessageSection = ({
                            messages,
                            calls,
                            userId,
                            selectedFriendId,
                            friends,
                            content,
                            setContent,
                            socket,
                            setSelectedFriendId,
                            className,
                            globalIncomingCall,
                            setGlobalIncomingCall,
                            forceUpdate,
                        }) => {
    const messagesContainerRef = useRef(null);
    const [showCallModal, setShowCallModal] = useState(false);
    const [callType, setCallType] = useState(null);
    const [isCaller, setIsCaller] = useState(false);
    const [isIncoming, setIsIncoming] = useState(false);
    const [callData, setCallData] = useState(null);
    const incomingCallRef = useRef(null);
    const [isCallButtonDisabled, setIsCallButtonDisabled] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const [typingTimeout, setTypingTimeout] = useState(null);
    const [editingMessageId, setEditingMessageId] = useState(null);
    const [editContent, setEditContent] = useState('');
    // const [messages, setMessages] = useState([]); // Removed as messages is now a prop


    const scrollToBottom = () => {
        setTimeout(() => {
            if (messagesContainerRef.current) {
                messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
            }
        }, 100);
    };

    useEffect(() => {
        scrollToBottom();

        // Mark messages as read when they're displayed
        if (socket && selectedFriendId && messages.length > 0) {
            const unreadMessages = messages.filter(
                msg => msg.senderId === selectedFriendId && !msg.isRead
            );

            if (unreadMessages.length > 0) {
                socket.emit('markMessagesAsRead', { senderId: selectedFriendId });
            }
        }
    }, [messages, calls, socket, selectedFriendId]);

    // Ensure the incoming call listener is properly set up
    useEffect(() => {
        if (!socket) {
            console.log('No socket available for incoming call listener');
            return;
        }

        const handleIncomingCall = (data) => {
            console.log('MessageSection: Incoming call received:', {
                ...data,
                signalData: data.signalData ? 'Signal data exists' : 'No signal data'
            });
            
            // Store the incoming call data in a ref to avoid race conditions
            incomingCallRef.current = data;

            // Make sure we have all required data
            if (!data || !data.senderId || !data.callType || !data.callId) {
                console.error('Received incomplete call data:', data);
                return;
            }

            // Set all the necessary state for the call modal
            setCallData(data);
            setCallType(data.callType);
            setIsIncoming(true);
            setIsCaller(false);

            // Force the modal to show with a slight delay to ensure state updates
            setTimeout(() => {
                console.log('Showing call modal for incoming call');
                setShowCallModal(true);
            }, 100);
        };

        console.log('Setting up incoming-call listener in MessageSection for user:', userId);
        socket.on('incoming-call', handleIncomingCall);

        return () => {
            console.log('Removing incoming-call listener in MessageSection');
            socket.off('incoming-call', handleIncomingCall);
        };
    }, [socket, userId]);

    // Handle global incoming call
    useEffect(() => {
        if (globalIncomingCall && !showCallModal) {
            console.log('Processing global incoming call:', {
                ...globalIncomingCall,
                signalData: globalIncomingCall.signalData ? 'Signal data exists' : 'No signal data'
            });

            // Set all the necessary state for the call modal
            setCallData(globalIncomingCall);
            setCallType(globalIncomingCall.callType);
            setIsIncoming(true);
            setIsCaller(false);

            // Force the modal to show with a slight delay to ensure state updates
            setTimeout(() => {
                console.log('Showing call modal for global incoming call');
                setShowCallModal(true);

                // Clear the global incoming call
                if (setGlobalIncomingCall) {
                    setGlobalIncomingCall(null);
                }
            }, 100);
        }
    }, [globalIncomingCall, showCallModal, setGlobalIncomingCall]);

    // Force update effect
    useEffect(() => {
        // If we have an incoming call stored in the ref, show it
        if (incomingCallRef.current && !showCallModal) {
            console.log('Force update triggered, showing stored incoming call');
            const data = incomingCallRef.current;

            setCallData(data);
            setCallType(data.callType);
            setIsIncoming(true);
            setIsCaller(false);

            setTimeout(() => {
                setShowCallModal(true);
                incomingCallRef.current = null; // Clear the ref after using it
            }, 100);
        }
    }, [forceUpdate, showCallModal]);

    const sendMessage = () => {
        if (!content.trim() || !socket || !selectedFriendId || !userId) return;
        socket.emit('sendMessage', {
            senderId: userId,
            receiverId: selectedFriendId,
            content: content.trim(),
        });
        setContent('');
    };

    // Add error handling for the startCall function
    const startCall = (type) => {
        if (!socket || !selectedFriendId || !userId || isCallButtonDisabled) {
            console.error('Cannot start call: missing socket, selectedFriendId, userId, or call button is disabled');
            return;
        }

        console.log(`Starting ${type} call to friend ${selectedFriendId}`);

        // Disable the call button to prevent multiple clicks
        setIsCallButtonDisabled(true);
        
        // Set a timeout to re-enable the button after 5 seconds
        setTimeout(() => {
            setIsCallButtonDisabled(false);
        }, 5000);
        
        // First, refresh call history to ensure we have the latest state
        socket.emit('getCallHistory', { friendId: selectedFriendId });
        
        // Then proceed with the call
        setCallType(type);
        setIsCaller(true);
        setIsIncoming(false);
        setCallData(null); // Clear any previous call data
        setShowCallModal(true);
    };

    const combinedHistory = useMemo(() => {
        const filteredMessages = messages.filter(
            (msg) =>
                (msg.senderId === userId && msg.receiverId === selectedFriendId) ||
                (msg.senderId === selectedFriendId && msg.receiverId === userId)
        );
        const filteredCalls = calls.filter(
            (call) =>
                (call.callerId === userId && call.receiverId === selectedFriendId) ||
                (call.callerId === selectedFriendId && call.receiverId === userId)
        );

        const history = [...filteredMessages, ...filteredCalls]
            .map((item) => ({
                ...item,
                type: item.content ? 'message' : 'call',
                // Ensure reactions is always an array
                reactions: item.reactions || []
            }))
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        return history;
    }, [messages, calls, userId, selectedFriendId]);

    const formatDuration = (seconds) => {
        if (!seconds) return '0s';
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
    };

    // Add a cleanup effect
    useEffect(() => {
        return () => {
            // Reset call state when component unmounts
            setShowCallModal(false);
            setCallType(null);
            setIsCaller(false);
            setIsIncoming(false);
            setCallData(null);
        };
    }, []);

    // Add a useEffect to handle the globalIncomingCall prop
    useEffect(() => {
        if (globalIncomingCall) {
            // Process the incoming call
            handleIncomingCall(globalIncomingCall);

            // Clear the global incoming call state to prevent duplicate processing
            setGlobalIncomingCall(null);
        }
    }, [globalIncomingCall, forceUpdate]);

    // Add a test function to manually trigger an incoming call (for debugging)
    const testIncomingCall = () => {
        if (!socket || !selectedFriendId || !userId) return;

        const testCallData = {
            senderId: selectedFriendId,
            receiverId: userId,
            callType: 'audio',
            callId: 'test-call-' + Date.now(),
            timestamp: new Date().toISOString()
        };

        console.log('Testing incoming call with data:', testCallData);

        // Directly call the handler as if we received the event
        handleIncomingCall(testCallData);
    };

    // Add this to your component for testing (you can remove this in production)
    useEffect(() => {
        // Add a global function for testing
        window.testIncomingCall = testIncomingCall;

        return () => {
            delete window.testIncomingCall;
        };
    }, [testIncomingCall]);

    useEffect(() => {
        if (!socket) return;

        const handleUserTyping = (data) => {
            if (data.userId === selectedFriendId) {
                setIsTyping(true);
            }
        };

        const handleUserStoppedTyping = (data) => {
            if (data.userId === selectedFriendId) {
                setIsTyping(false);
            }
        };

        socket.on('userTyping', handleUserTyping);
        socket.on('userStoppedTyping', handleUserStoppedTyping);

        return () => {
            socket.off('userTyping', handleUserTyping);
            socket.off('userStoppedTyping', handleUserStoppedTyping);
        };
    }, [socket, selectedFriendId]);

    const handleInputChange = (e) => {
        setContent(e.target.value);

        // Emit typing event
        if (socket && selectedFriendId) {
            socket.emit('typing', { receiverId: selectedFriendId });

            // Clear existing timeout
            if (typingTimeout) clearTimeout(typingTimeout);

            // Set new timeout to emit stop typing after 2 seconds of inactivity
            const timeout = setTimeout(() => {
                socket.emit('stopTyping', { receiverId: selectedFriendId });
            }, 2000);

            setTypingTimeout(timeout);
        }
    };

    useEffect(() => {
        if (!socket) return;

        const handleMessageUpdated = (updatedMessage) => {
            // Since messages is a prop, we can't directly update it here
            // The parent component should handle this update
            console.log('Message updated received:', updatedMessage.id);
        };
        
        const handleMessageDeleted = ({ messageId }) => {
            // Similarly, the parent should handle message deletion
            console.log('Message deletion received:', messageId);
        };

        const handleError = (error) => {
            console.error('Socket error received:', error);
            // You might want to display this error to the user
        };

        socket.on('messageUpdated', handleMessageUpdated);
        socket.on('messageDeleted', handleMessageDeleted);

        return () => {
            socket.off('messageUpdated', handleMessageUpdated);
            socket.off('messageDeleted', handleMessageDeleted);
        };
    }, [socket]);

    const startEditing = (message) => {
        setEditingMessageId(message.id);
        setEditContent(message.content);
    };

    const cancelEditing = () => {
        setEditingMessageId(null);
        setEditContent('');
    };

    const saveEdit = () => {
        if (!editContent.trim() || !socket) {
            console.error('Cannot save edit: missing content or socket connection');
            return;
        }

        if (!editingMessageId) {
            console.error('Cannot save edit: missing message ID');
            return;
        }

        socket.emit('editMessage', {
            messageId: editingMessageId,
            content: editContent.trim()
        });

        // Add a timeout to reset editing state if no response is received
        const timeoutId = setTimeout(() => {
            console.log('Edit message timeout - no response received');
            setEditingMessageId(null);
            setEditContent('');
        }, 5000);

        // Listen for the messageUpdated event to confirm the edit was successful
        const handleMessageUpdated = (updatedMessage) => {
            if (updatedMessage.id === editingMessageId) {
                clearTimeout(timeoutId);
                setEditingMessageId(null);
                setEditContent('');
                socket.off('messageUpdated', handleMessageUpdated);
            }
        };

        socket.on('messageUpdated', handleMessageUpdated);

        // Also listen for errors
        const handleError = (error) => {
            if (editingMessageId) {
                console.error('Error editing message:', error);
                clearTimeout(timeoutId);
                socket.off('error', handleError);
            }
        };

        socket.on('error', handleError);
    };

    const deleteMessage = (messageId) => {
        if (!socket) return;

        if (window.confirm('Are you sure you want to delete this message?')) {
            socket.emit('deleteMessage', { messageId });
        }
    };

    const MessageDropdown = ({ message, startEditing, deleteMessage }) => {
        const [isOpen, setIsOpen] = useState(false);
        const dropdownRef = useRef(null);

        // Close dropdown when clicking outside
        useEffect(() => {
            const handleClickOutside = (event) => {
                if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                    setIsOpen(false);
                }
            };

            if (isOpen) {
                document.addEventListener('mousedown', handleClickOutside);
            }

            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
            };
        }, [isOpen]);

        const handleEdit = () => {
            startEditing(message);
            setIsOpen(false);
        };

        const handleDelete = () => {
            deleteMessage(message.id);
            setIsOpen(false);
        };

        return (
            <div className="relative" ref={dropdownRef}>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="text-white hover:text-sky-500 p-1 rounded-full hover:bg-gray-100"
                    aria-label="Message options"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                    >
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                    </svg>
                </button>

                {isOpen && (
                    <div className="absolute right-0 mt-1 w-32 bg-white rounded-md shadow-lg z-20 border border-gray-200">
                        <div className="py-1">
                            <button
                                onClick={handleEdit}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-sky-500"
                            >
                                Edit
                            </button>
                            <button
                                onClick={handleDelete}
                                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <main className={`flex-1 flex-col relative ${className || 'flex'}`}>
            {selectedFriendId ? (
                <>
                    <div className="bg-white p-4 border-b border-sky-500 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <button
                                onClick={() => setSelectedFriendId(null)}
                                className="md:hidden mr-2 p-1 rounded-full hover:bg-gray-200"
                                aria-label="Back to friend list"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-6 w-6"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>
                            {(() => {
                                const selectedFriend = friends.find((f) => f.id === selectedFriendId);
                                return (
                                    <div className="flex items-center space-x-3">
                                        <div className="relative">
                                            {selectedFriend?.profilePic ? (
                                                <div className="relative w-8 h-8 sm:w-10 sm:h-10 rounded-full overflow-hidden">
                                                    <Image
                                                        src={selectedFriend.profilePic}
                                                        alt={selectedFriend.name || 'Friend'}
                                                        width={40}
                                                        height={40}
                                                        className="object-cover"
                                                    />
                                                </div>
                                            ) : (
                                                <div className="relative w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gray-200 flex items-center justify-center">
                                                    <svg
                                                        xmlns="http://www.w3.org/2000/svg"
                                                        className="h-5 w-5 text-gray-500"
                                                        viewBox="0 0 20 20"
                                                        fill="currentColor"
                                                    >
                                                        <path
                                                            fillRule="evenodd"
                                                            d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                                                            clipRule="evenodd"
                                                        />
                                                    </svg>
                                                </div>
                                            )}
                                        </div>
                                        <h2 className="text-lg text-black font-semibold">{selectedFriend?.name || 'Unknown'}</h2>
                                    </div>
                                );
                            })()}
                        </div>
                        <div className="flex space-x-2">
                            <button
                                onClick={() => startCall('audio')}
                                disabled={isCallButtonDisabled}
                                className={`p-2 rounded-full ${isCallButtonDisabled ? 'bg-gray-400' : 'bg-blue-500 hover:bg-blue-600'} text-white`}
                                title="Audio Call"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-6 w-6 text-sky-500"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                                    />
                                </svg>
                            </button>
                            <button
                                onClick={() => startCall('video')}
                                className="p-2 rounded-full hover:bg-gray-200"
                                aria-label="Start video call"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-6 w-6 text-sky-500"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                                    />
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div
                        ref={messagesContainerRef}
                        className="flex-1 overflow-y-auto p-2 sm:p-4 mb-36 bg-gray-50"
                        style={{ maxHeight: 'calc(100vh - 200px)' }}
                    >
                        {combinedHistory.map((item) => (
                            <div
                                key={item.id}
                                className={`mb-3 sm:mb-4 flex ${
                                    item.type === 'message'
                                        ? item.senderId === userId
                                            ? 'justify-end'
                                            : 'justify-start'
                                        : item.callerId === userId
                                            ? 'justify-end'
                                            : 'justify-start'
                                }`}
                            >
                                <div
                                    className={`max-w-[75%] sm:max-w-xs p-2 sm:p-3 rounded-lg text-sm sm:text-base ${
                                        item.type === 'message'
                                            ? item.senderId === userId
                                                ? 'bg-sky-500 text-white'
                                                : 'bg-gray-200 text-black'
                                            : item.callerId === userId
                                                ? 'bg-sky-500 text-white'
                                                : 'bg-gray-200 text-black'
                                    }`}
                                >
                                    {item.type === 'message' ? (
                                        <>
                                            {editingMessageId === item.id ? (
                                                <div className="flex flex-col space-y-2">
                                                    <textarea
                                                        value={editContent}
                                                        onChange={(e) => setEditContent(e.target.value)}
                                                        className="p-2 border border-sky-500 rounded-lg text-sm"
                                                        autoFocus
                                                    />
                                                    <div className="flex space-x-2">
                                                        <button
                                                            onClick={saveEdit}
                                                            className="px-2 py-1 bg-sky-500 text-white rounded-lg text-xs"
                                                        >
                                                            Save
                                                        </button>
                                                        <button
                                                            onClick={cancelEditing}
                                                            className="px-2 py-1 bg-sky-300 text-sky-700 rounded-lg text-xs"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex justify-between items-start">
                                                        <p className="pr-6">{item.content} {item.isEdited && <span className="text-xs italic">(edited)</span>}</p>
                                                        {item.senderId === userId && (
                                                            <MessageDropdown
                                                                message={item}
                                                                startEditing={startEditing}
                                                                deleteMessage={deleteMessage}
                                                            />
                                                        )}
                                                    </div>
                                                    <MessageReactions
                                                        message={item}
                                                        userId={userId}
                                                        socket={socket}
                                                    />
                                                    <p className="text-xs opacity-75 mt-1">
                                                        {new Date(item.createdAt).toLocaleString('en-US', {
                                                            hour: 'numeric',
                                                            minute: 'numeric',
                                                            hour12: true,
                                                        })}
                                                    </p>
                                                    {item.type === 'message' && item.senderId === userId && (
                                                        <div className="text-xs text-right mt-1">
                                                            {item.isRead ? (
                                                                <span className="text-green-500">
                                                                    Read {item.readAt ? new Date(item.readAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                                                                </span>
                                                            ) : (
                                                                <span className="text-white">Sent</span>
                                                            )}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <p>
                                                {item.callerId === userId
                                                    ? `Outgoing ${item.callType} Call`
                                                    : `Incoming ${item.callType} Call`}{' '}
                                                {item.status === 'missed' ? '(Missed)' : ''}
                                            </p>
                                            <p className="text-xs opacity-75 mt-1">
                                                {new Date(item.createdAt).toLocaleString('en-US', {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    hour: 'numeric',
                                                    minute: 'numeric',
                                                    hour12: true,
                                                })}
                                                {item.duration ? ` • Duration: ${formatDuration(item.duration)}` : ''}
                                            </p>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-white p-2 sm:p-4 border-t border-sky-500 z-10">
                        <div className="flex space-x-2 py-2">
              <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage();
                      }
                  }}
                  className="flex-1 p-2 border border-sky-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm sm:text-base text-black"
                  placeholder="Type a message..."
              />
                            <button
                                onClick={sendMessage}
                                disabled={!content.trim()}
                                className={`px-4 py-2 rounded-lg text-sm sm:text-base ${
                                    content.trim()
                                        ? 'bg-sky-500 text-white hover:bg-sky-600'
                                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                }`}
                            >
                                Send
                            </button>
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex-1 flex items-center justify-center text-gray-500">
                    <p className="text-center">Select a friend to start chatting</p>
                </div>
            )}

            {/* Render the CallModal when showCallModal is true */}
            {showCallModal && (
                <CallModal
                    socket={socket}
                    userId={userId}
                    selectedFriendId={isIncoming ? callData?.senderId : selectedFriendId}
                    friends={friends}
                    callType={callType}
                    isCaller={isCaller}
                    isIncoming={isIncoming}
                    onClose={() => {
                        console.log('CallModal closed');
                        setShowCallModal(false);
                        setCallType(null);
                        setIsCaller(false);
                        setIsIncoming(false);
                        setCallData(null);
                    }}
                    callData={callData}
                />
            )}
        </main>
    );
};

const MessageReactions = ({ message, userId, socket }) => {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const commonEmojis = ['👍', '❤️', '😂', '😮', '😢', '👏'];
  const emojiPickerRef = useRef(null);

  // Ensure message.reactions is always an array
  const reactions = useMemo(() => {
    return Array.isArray(message.reactions) ? message.reactions : [];
  }, [message.reactions]);

  // Group reactions by emoji for display and counting
  const groupedReactions = useMemo(() => {
    const groups = {};
    
    reactions.forEach(reaction => {
      if (!groups[reaction.emoji]) {
        groups[reaction.emoji] = {
          emoji: reaction.emoji,
          count: 0,
          users: [],
          userHasReacted: false
        };
      }
      groups[reaction.emoji].count++;
      groups[reaction.emoji].users.push(reaction.userId);
      if (reaction.userId === userId) {
        groups[reaction.emoji].userHasReacted = true;
      }
    });

    return Object.values(groups);
  }, [reactions, userId]);

  // Find if user has already reacted to this message with any emoji
  const userExistingReaction = useMemo(() => {
    return reactions.find(reaction => reaction.userId === userId);
  }, [reactions, userId]);



  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
    };

    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);

  const handleReactionClick = (emoji, userHasReacted) => {
    // If user clicks on their own reaction, toggle the emoji picker
    if (userHasReacted && userExistingReaction?.emoji === emoji) {
      setShowEmojiPicker(!showEmojiPicker);
    } else {
      // Otherwise, toggle the reaction as before
      toggleReaction(emoji);
    }
  };

  const toggleReaction = (emoji) => {
    if (!socket || !socket.connected) {
      console.error('Cannot toggle reaction: Socket not connected');
      return;
    }
    
    console.log('Toggling reaction:', {
      messageId: message.id,
      emoji,
      userExistingReaction: userExistingReaction?.emoji || 'none'
    });

    // Check if user already has a reaction with this emoji
    const hasThisReaction = groupedReactions.find(
      group => group.emoji === emoji && group.userHasReacted
    );
    
    // Check if user has any reaction on this message
    if (userExistingReaction) {
      // If clicking the same emoji, remove the reaction
      if (hasThisReaction) {
        console.log(`Removing reaction ${emoji} from message ${message.id}`);
        socket.emit('removeReaction', {
          messageId: message.id,
          emoji: userExistingReaction.emoji
        });
      }
      // If clicking a different emoji, replace the reaction
      else {
        console.log(`Replacing reaction from ${userExistingReaction.emoji} to ${emoji} on message ${message.id}`);
        socket.emit('replaceReaction', {
          messageId: message.id,
          oldEmoji: userExistingReaction.emoji,
          newEmoji: emoji
        });
      }
    }
    // User has no reaction yet, add a new one
    else {
      console.log(`Adding reaction ${emoji} to message ${message.id}`);
      socket.emit('addReaction', { messageId: message.id, emoji });
    }
    
    setShowEmojiPicker(false);
  };

  return (
    <div className="mt-1 relative">
      {/* Display grouped reactions */}
      <div className="flex flex-wrap gap-1">
        {groupedReactions.map(group => (
          <button
            key={group.emoji}
            className={`px-2 py-1 rounded-full text-xs ${
              group.userHasReacted ? 'bg-sky-200 hover:bg-sky-300' : 'bg-gray-200 hover:bg-gray-300'
            } transition-colors`}
            onClick={() => handleReactionClick(group.emoji, group.userHasReacted)}
            title={group.userHasReacted ? 
              "Click to change your reaction" : 
              `${group.count} ${group.count === 1 ? 'reaction' : 'reactions'}`
            }
          >
            {group.emoji} {group.count}
          </button>
        ))}

        {/* Only show the emoji picker toggle button if user hasn't reacted yet */}
        {!userExistingReaction && (
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="px-2 py-1 rounded-full text-xs bg-sky-400 hover:bg-sky-300 transition-colors text-white"
            title="Add reaction"
          >
            <span role="img" aria-label="Add reaction">+😀</span>
          </button>
        )}
      </div>

      {/* Emoji picker */}
      {showEmojiPicker && (
        <div
          ref={emojiPickerRef}
          className={`absolute mt-2 bg-white shadow-lg rounded-lg p-2 z-10 border border-gray-200
           ${message.senderId === userId ? 'right-0' : 'left-0'}
          `}
        >
          <div className="flex gap-2">
            {commonEmojis.map(emoji => (
              <button
                key={emoji}
                onClick={() => toggleReaction(emoji)}
                className={`hover:bg-gray-100 p-2 rounded-full text-lg transition-colors ${
                  groupedReactions.some(g => g.emoji === emoji && g.userHasReacted) 
                    ? 'bg-sky-100' 
                    : ''
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MessageSection;
