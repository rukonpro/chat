'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import Image from 'next/image';
import SimplePeer from 'simple-peer';

// Reusable CallButton component
const CallButton = ({ onClick, bgColor, hoverColor, svgPath, size = 'w-16 h-16' }) => (
    <button
        onClick={onClick}
        className={`${size} ${bgColor} rounded-full flex items-center justify-center ${hoverColor} transition-colors`}
    >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="white">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={svgPath} />
        </svg>
    </button>
);

// SVG paths for reuse
const SVG_PATHS = {
    reject: 'M6 18L18 6M6 6l12 12',
    accept: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
    mute: 'M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z',
    unmute: 'M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z',
    videoOff: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m-6-4h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
    videoOn: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
};

// Option button SVGs (simplified for reuse)
const OPTION_SVGS = [
    { path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z', fill: true },
    { path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm1-13h-2v4h2zm0 6h-2v2h2z', fill: true },
    { path: 'M17 3H7c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H7V5h10v14zm-4-4h-2v-2h2zm0-4h-2V7h2v4z', fill: true },
    { path: 'M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 9c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm0-4c1.11 0 2-.89 2-2s-.89-2-2-2-2 .89-2 2 .89 2 2 2z', fill: true },
];

const CallModal = ({
    socket,
    userId,
    selectedFriendId,
    friends,
    callType,
    isCaller,
    isIncoming,
    onClose,
    callData,
}) => {
    console.log('CallModal rendered with props:', {
        userId,
        selectedFriendId,
        callType,
        isCaller,
        isIncoming,
        callData
    });

    const [localStream, setLocalStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [callStatus, setCallStatus] = useState(isIncoming ? 'incoming' : 'calling');
    const [callId, setCallId] = useState(callData?.callId || null);
    const [error, setError] = useState(null);
    const [timer, setTimer] = useState(0);
    const [isAudioMuted, setIsAudioMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);
    const [callDirection, setCallDirection] = useState(isIncoming ? 'incoming' : 'outgoing');

    // Add a debug effect to log important state changes
    useEffect(() => {
        console.log('CallModal state updated:', {
            callStatus,
            callId,
            callDirection,
            isIncoming,
            isCaller
        });
    }, [callStatus, callId, callDirection, isIncoming, isCaller]);

    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const peerRef = useRef(null);
    const signalProcessed = useRef(false);
    const timerRef = useRef(null);
    const ringtoneRef = useRef(null);
    const remoteAudioRef = useRef(null);
    const connectTimeoutRef = useRef(null);
    const signalSent = useRef(false);
    const isMountedRef = useRef(true);

    const friend = useMemo(() =>
        friends?.find((f) => f.id === (isIncoming ? callData?.senderId : selectedFriendId)) || null,
        [friends, selectedFriendId, isIncoming, callData]
    );

    const formatTimer = (seconds) => {
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    };

    const renderFriendImage = () => (
        <div className="relative w-20 h-20">
            {friend?.profilePic ? (
                <div className="w-full h-full rounded-full overflow-hidden shadow-md">
                    <Image
                        src={friend.profilePic}
                        alt={friend.name || 'Friend'}
                        width={80}
                        height={80}
                        className="object-cover"
                    />
                </div>
            ) : (
                <div className="w-full h-full rounded-full bg-gray-200 flex items-center justify-center shadow-md">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-10 w-10 text-gray-500"
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
    );

    const setupAudioOutput = (stream) => {
        if (callType === 'audio' && stream) {
            const audioElement = new Audio();
            audioElement.srcObject = stream;
            audioElement.play().catch(e => console.error('[CallModal] Error playing audio:', e));
            return audioElement;
        }
        return null;
    };

    const cleanupResources = (delay = 0, reason = 'unknown', forceClose = false) => {
        console.log(`[CallModal] Cleaning up resources. Reason: ${reason}, Delay: ${delay}ms, ForceClose: ${forceClose}`);

        // Stop all tracks in the local stream
        if (localStream) {
            localStream.getTracks().forEach((track) => {
                track.stop();
                console.log(`[CallModal] Stopped track: ${track.kind}`);
            });
            setLocalStream(null);
        }

        // Destroy peer connection
        if (peerRef.current) {
            try {
                peerRef.current.destroy();
                console.log('[CallModal] Destroyed peer connection');
            } catch (err) {
                console.error('[CallModal] Error destroying peer:', err);
            }
            peerRef.current = null;
        }

        // Clear all timers and audio elements
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        if (connectTimeoutRef.current) {
            clearTimeout(connectTimeoutRef.current);
            connectTimeoutRef.current = null;
        }

        if (ringtoneRef.current) {
            ringtoneRef.current.pause();
            ringtoneRef.current.src = '';
            ringtoneRef.current = null;
        }

        if (remoteAudioRef.current) {
            remoteAudioRef.current.pause();
            remoteAudioRef.current.src = '';
            remoteAudioRef.current = null;
        }

        // Close the modal after the specified delay
        if (forceClose && delay > 0) {
            setTimeout(() => {
                console.log(`[CallModal] Closing modal after ${delay}ms delay`);
                onClose();
            }, delay);
        } else if (forceClose) {
            console.log('[CallModal] Closing modal immediately');
            onClose();
        }
    };

    const toggleAudio = () => {
        if (localStream) {
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsAudioMuted(!audioTrack.enabled);
            }
        }
    };

    const toggleVideo = () => {
        if (localStream && callType === 'video') {
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setIsVideoOff(!videoTrack.enabled);
            }
        }
    };

    useEffect(() => {
        if (!isMountedRef.current) return;

        console.log('[CallModal] Call initialization effect triggered', {
            socket: !!socket,
            userId,
            selectedFriendId,
            callType,
            callDirection,
            callData,
            callStatus,
            callId
        });

        const initMedia = async () => {
            try {
                // Only initialize media if we're the caller or if we've explicitly accepted the call
                if (callDirection === 'incoming' && callStatus === 'incoming') {
                    console.log('[CallModal] Incoming call waiting for user to accept');
                    return;
                }

                const constraints = { audio: true, video: callType === 'video' };
                console.log('[CallModal] Requesting media with constraints:', constraints);

                // Check if component is still mounted before proceeding
                if (!isMountedRef.current) {
                    console.log('[CallModal] Component unmounted before media request, aborting');
                    return;
                }

                const stream = await navigator.mediaDevices.getUserMedia(constraints);

                // Check again if component is still mounted
                if (!isMountedRef.current) {
                    console.log('[CallModal] Component unmounted after media obtained, cleaning up stream');
                    stream.getTracks().forEach(track => track.stop());
                    return;
                }

                console.log('[CallModal] Media stream obtained successfully');
                setLocalStream(stream);
                if (localVideoRef.current && callType === 'video') {
                    localVideoRef.current.srcObject = stream;
                }

                // Create new peer with appropriate initiator setting
                const peer = new SimplePeer({
                    initiator: callDirection === 'outgoing',
                    trickle: false,
                    stream,
                    config: {
                        iceServers: [
                            { urls: 'stun:stun.l.google.com:19302' },
                            { urls: 'stun:stun1.l.google.com:19302' },
                            { urls: 'stun:stun2.l.google.com:19302' },
                        ],
                    },
                });

                console.log(`[CallModal] Created new peer. Initiator: ${callDirection === 'outgoing'}`);
                peerRef.current = peer;

                // Set up timeout for connection - reduce from 30s to 15s
                if (callStatus === 'calling' || callStatus === 'connecting') {
                    if (connectTimeoutRef.current) {
                        clearTimeout(connectTimeoutRef.current);
                    }

                    connectTimeoutRef.current = setTimeout(() => {
                        if (!isMountedRef.current) return;

                        if ((callStatus === 'calling' || callStatus === 'connecting')) {
                            console.log('[CallModal] Connection timed out');
                            setCallStatus('error');
                            setError('Connection timed out. Please try again.');
                            cleanupResources(0, 'connection timeout', true);
                        }
                    }, 15000); // 15-second timeout instead of 30
                }

                peer.on('signal', (data) => {
                    if (!isMountedRef.current) return;

                    console.log(`[CallModal] Peer signal generated. Direction: ${callDirection}, Status: ${callStatus}`);

                    if (callDirection === 'outgoing' && !signalSent.current) {
                        console.log('[CallModal] Emitting call-user signal');
                        socket.emit('call-user', {
                            senderId: userId,
                            receiverId: selectedFriendId,
                            signalData: data,
                            callType
                        });
                        signalSent.current = true;
                    } else if (callDirection === 'incoming' && callStatus === 'connecting' && !signalSent.current) {
                        // Make sure we have a valid callId
                        const currentCallId = callData?.callId || callId;
                        if (!currentCallId) {
                            console.error('[CallModal] Cannot accept call: missing call ID');
                            setCallStatus('error');
                            setError('Cannot accept call: missing call information');
                            return;
                        }

                        console.log('[CallModal] Emitting accept-call signal for call:', currentCallId);
                        socket.emit('accept-call', {
                            signalData: data,
                            senderId: userId,
                            receiverId: callData?.senderId,
                            callId: currentCallId
                        });
                        signalSent.current = true;
                    } else {
                        console.log('[CallModal] Skipping duplicate signal emission');
                    }
                });

                peer.on('connect', () => {
                    console.log('[CallModal] Peer connection established');
                    if (isMounted) {
                        setCallStatus('connected');
                        if (connectTimeoutRef.current) {
                            clearTimeout(connectTimeoutRef.current);
                            connectTimeoutRef.current = null;
                        }
                    }
                });

                peer.on('stream', (remoteStream) => {
                    console.log('[CallModal] Received remote stream');
                    if (isMounted) {
                        setRemoteStream(remoteStream);
                        if (remoteVideoRef.current && callType === 'video') {
                            remoteVideoRef.current.srcObject = remoteStream;
                        } else if (callType === 'audio') {
                            remoteAudioRef.current = setupAudioOutput(remoteStream);
                        }
                        setCallStatus('connected');
                        if (connectTimeoutRef.current) {
                            clearTimeout(connectTimeoutRef.current);
                            connectTimeoutRef.current = null;
                        }
                    }
                });

                peer.on('error', (err) => {
                    console.error('[CallModal] Peer error:', err.message);
                    if (isMounted) {
                        setCallStatus('error');
                        setError('WebRTC connection failed: ' + err.message);
                        if (connectTimeoutRef.current) {
                            clearTimeout(connectTimeoutRef.current);
                            connectTimeoutRef.current = null;
                        }
                    }
                });

                peer.on('close', () => {
                    console.log('[CallModal] Peer connection closed');
                    if (isMounted && callStatus !== 'ended' && callStatus !== 'rejected') {
                        setCallStatus('ended');
                        cleanupResources(2000, 'peer connection closed', true);
                    }
                });

                // Process incoming call signal if this is an incoming call that was accepted
                if (callDirection === 'incoming' && callData && callData.signalData && callStatus === 'connecting') {
                    console.log('[CallModal] Processing incoming call signal for accepted call');
                    try {
                        peer.signal(callData.signalData);
                    } catch (err) {
                        console.error('[CallModal] Failed to process incoming call:', err.message);
                        if (isMounted) {
                            setCallStatus('error');
                            setError('Failed to process incoming call');
                        }
                    }
                }

                return () => {
                    isMounted = false;
                };
            } catch (err) {
                console.error('[CallModal] Failed to access media:', err.message);
                setCallStatus('error');
                setError('Failed to access microphone or camera: ' + err.message);
            }
        };

        if (['calling', 'connecting'].includes(callStatus)) {
            initMedia();
        }

        return () => {
            console.log('[CallModal] initMedia useEffect cleanup triggered');
            if (['rejected', 'ended', 'error'].includes(callStatus)) {
                cleanupResources(0, 'initMedia useEffect cleanup', false);
            }
        };
    }, [socket, userId, selectedFriendId, callType, callDirection, callData, callStatus, callId]);

    useEffect(() => {
        if (callStatus === 'connected') {
            console.log('[CallModal] Starting timer');
            setTimer(0);
            timerRef.current = setInterval(() => setTimer((prev) => prev + 1), 1000);
        }
        return () => {
            if (timerRef.current) {
                console.log('[CallModal] Clearing timer');
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [callStatus]);

    useEffect(() => {
        if (!socket) return;

        const handleCallInitiated = ({ callId }) => {
            console.log(`[CallModal] Call initiated. callId: ${callId}`);
            if (!callId) {
                console.error('[CallModal] Received call-initiated event without callId');
                return;
            }

            setCallId(callId);

            // If we already have a call ID but received a different one, log it
            if (callId && callId !== callId && callId !== null) {
                console.log(`[CallModal] Received different callId: ${callId} (current: ${callId})`);
            }
        };
        
        const handleAcceptCall = (data) => {
            console.log('[CallModal] Accept-call event received:', data);
            if (peerRef.current && data.signalData) {
                try {
                    peerRef.current.signal(data.signalData);
                    setCallStatus('connecting');
                } catch (err) {
                    console.error('[CallModal] Failed to process accept-call signal:', err.message);
                    setCallStatus('error');
                    setError('Failed to connect call');
                }
            } else {
                console.error('[CallModal] Cannot process accept-call: peer connection not initialized');
                setCallStatus('error');
                setError('Connection not initialized');
            }
        };

        const handleRejectCall = () => {
            console.log('[CallModal] Reject-call event received');
            setCallStatus('rejected');
            cleanupResources(2000, 'reject-call event', true);
        };

        const handleEndCall = () => {
            console.log('[CallModal] End-call event received');
            setCallStatus('ended');
            cleanupResources(2000, 'end-call event', true);
        };

        const handleCallError = ({ message }) => {
            console.log(`[CallModal] Call-error event received: ${message}`);

            // Ignore the "There is already an active call" error
            if (message === 'There is already an active call with this user') {
                console.log('[CallModal] Ignoring "already active call" error');
                return; // Don't close the modal for this error
            }

            setCallStatus('error');
            setError(message);
            cleanupResources(2000, 'call-error event', true);
        };

        // Add incoming call handler directly in CallModal as a backup
        const handleIncomingCall = (data) => {
            console.log('[CallModal] Incoming call event received directly in CallModal:', {
                ...data,
                signalData: data.signalData ? 'Signal data exists' : 'No signal data'
            });
            if (isIncoming && callData?.callId === data.callId) {
                // Update call data if this is for the current call
                setCallData(data);
            }
        };

        console.log('[CallModal] Setting up socket event listeners');
        if (callDirection === 'outgoing') socket.on('call-initiated', handleCallInitiated);
        socket.on('accept-call', handleAcceptCall);
        socket.on('reject-call', handleRejectCall);
        socket.on('end-call', handleEndCall);
        socket.on('call-error', handleCallError);
        socket.on('incoming-call', handleIncomingCall); // Add direct handler for incoming calls

        return () => {
            console.log('[CallModal] Removing socket event listeners');
            if (callDirection === 'outgoing') socket.off('call-initiated', handleCallInitiated);
            socket.off('accept-call', handleAcceptCall);
            socket.off('reject-call', handleRejectCall);
            socket.off('end-call', handleEndCall);
            socket.off('call-error', handleCallError);
            socket.off('incoming-call', handleIncomingCall);
        };
    }, [socket, callDirection, isIncoming, callData]);

    useEffect(() => {
        if (!isMountedRef.current) return;

        let ringtoneFile = null;

        if (callStatus === 'incoming') {
            ringtoneFile = '/call-ringtone.mp3';
        } else if (callStatus === 'calling') {
            ringtoneFile = '/calling-sound.mp3';
        }

        // Only create a new audio element if we don't already have one
        // and if we have a valid ringtone file to play
        if (ringtoneFile && !ringtoneRef.current) {
            console.log(`[CallModal] Playing ringtone: ${ringtoneFile}`);

            try {
                const audio = new Audio(ringtoneFile);
                audio.loop = true;
                ringtoneRef.current = audio;

                // Add error handling for audio playback
                const playPromise = audio.play();

                if (playPromise !== undefined) {
                    playPromise.catch((e) => {
                        console.log('[CallModal] Error playing ringtone:', e);
                        // Don't try to auto-play again, as it might be blocked by browser policy
                    });
                }
            } catch (error) {
                console.error('[CallModal] Failed to create audio element:', error);
            }
        }

        // Stop ringtone when call is connected, rejected, or ended
        if (['connected', 'rejected', 'ended', 'error'].includes(callStatus) && ringtoneRef.current) {
            console.log('[CallModal] Stopping ringtone due to status change');
            try {
                ringtoneRef.current.pause();
                ringtoneRef.current = null;
            } catch (error) {
                console.error('[CallModal] Error stopping ringtone:', error);
            }
        }

        return () => {
            if (ringtoneRef.current) {
                console.log('[CallModal] Stopping ringtone in cleanup');
                try {
                    ringtoneRef.current.pause();
                    ringtoneRef.current = null;
                } catch (error) {
                    console.error('[CallModal] Error stopping ringtone in cleanup:', error);
                }
            }
        };
    }, [callStatus]);

    const cleanup = () => {
        cleanupResources(0, 'manual cleanup', true);
    };

    const handleAcceptCall = () => {
        console.log('[CallModal] Accepting call with data:', callData);

        if (!callData || !callData.callId) {
            console.error('[CallModal] Cannot accept call: missing call data');
            setError('Cannot accept call: missing call information');
            return;
        }

        setCallStatus('connecting');

        // Ensure we have the correct call ID
        if (callData.callId && !callId) {
            setCallId(callData.callId);
        }

        // The useEffect will detect the status change and initialize media
    };
    const handleRejectCall = () => {
        console.log('[CallModal] Rejecting call with data:', callData);

        if (!callData || !callData.callId) {
            console.error('[CallModal] Cannot reject call: missing call data');
            setError('Cannot reject call: missing call information');
            onClose();
            return;
        }

        socket.emit('reject-call', {
            senderId: userId,
            receiverId: callData.senderId,
            callId: callData.callId || callId
        });

        setCallStatus('rejected');
        cleanupResources(2000, 'handleRejectCall', true);
    };
    const handleEndCall = () => {
        console.log('[CallModal] Ending call');
        socket.emit('end-call', { senderId: userId, receiverId: selectedFriendId, callId: callId || null });
        setCallStatus('ended');
        cleanupResources(2000, 'handleEndCall', true);
    };

    const renderCommonHeader = (title) => (
        <div className="flex flex-col items-center mb-8">
            {renderFriendImage()}
            <h2 className="text-3xl font-bold mt-4">{title}</h2>
            <p className="text-xl">{friend?.name || 'Unknown'}</p>
        </div>
    );

    const renderOptionButtons = () => (
        <div className="flex flex-col items-center space-y-4">
            {[0, 1].map((row) => (
                <div key={row} className="flex space-x-4">
                    {OPTION_SVGS.slice(row * 3, (row + 1) * 3).map((svg, idx) => (
                        <button
                            key={idx}
                            className="w-12 h-12 bg-sky-700/50 rounded-full flex items-center justify-center hover:bg-sky-800 transition-colors"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-6 w-6"
                                fill={svg.fill ? 'white' : 'none'}
                                viewBox="0 0 24 24"
                            >
                                <path d={svg.path} />
                            </svg>
                        </button>
                    ))}
                </div>
            ))}
        </div>
    );

    const renderCloseButton = () => (
        <div className="flex justify-center">
            <CallButton
                onClick={() => cleanupResources(0, 'renderCloseButton', true)}
                bgColor="bg-sky-700/50"
                hoverColor="hover:bg-sky-800"
                svgPath={SVG_PATHS.reject}
            />
        </div>
    );

    useEffect(() => {
        console.log('[CallModal] Component mounted');
        isMountedRef.current = true;

        return () => {
            console.log('[CallModal] Component unmounted - performing final cleanup');
            isMountedRef.current = false;
            cleanupResources(0, 'component unmounted', false);
        };
    }, []);

    return (
        <div className="fixed inset-0 bg-transparent flex items-center justify-center z-50">
            <div className="bg-gradient-to-b from-sky-500 to-sky-600 rounded-2xl w-[300px] h-[500px] p-4 flex flex-col items-center justify-center text-white relative overflow-hidden">
                <div className="absolute top-4 right-4 text-sm">
                    {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                </div>

                {/* Video elements for video calls */}
                {callType === 'video' && callStatus === 'connected' && (
                    <>
                        {remoteStream && (
                            <div className="absolute inset-0 bg-black">
                                <video
                                    ref={remoteVideoRef}
                                    autoPlay
                                    playsInline
                                    className="absolute inset-0 w-full h-full object-cover"
                                />
                            </div>
                        )}
                        {localStream && (
                            <div className="absolute bottom-4 right-4 w-24 h-32 rounded-lg overflow-hidden border-2 border-white shadow-lg z-10">
                                <video
                                    ref={localVideoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        )}
                    </>
                )}

                {/* Call UI states */}
                {callStatus === 'incoming' && (
                    <>
                        {renderCommonHeader(`Incoming ${callType === 'video' ? 'Video' : 'Audio'} Call`)}
                        <div className="flex space-x-8">
                            <CallButton
                                onClick={handleRejectCall}
                                bgColor="bg-red-600"
                                hoverColor="hover:bg-red-700"
                                svgPath={SVG_PATHS.reject}
                            />
                            <CallButton
                                onClick={handleAcceptCall}
                                bgColor="bg-green-600"
                                hoverColor="hover:bg-green-700"
                                svgPath={SVG_PATHS.accept}
                            />
                        </div>
                    </>
                )}
                {callStatus === 'calling' && (
                    <>
                        {renderCommonHeader('Calling...')}
                        <div className="flex justify-center">
                            <CallButton
                                onClick={handleEndCall}
                                bgColor="bg-red-600"
                                hoverColor="hover:bg-red-700"
                                svgPath={SVG_PATHS.reject}
                            />
                        </div>
                    </>
                )}

                {callStatus === 'connecting' && (
                    <>
                        {renderCommonHeader('Connecting...')}
                    </>
                )}
                
                {callStatus === 'connected' && (
                    <>
                        {callType === 'video' ? (
                            <div className={`absolute bottom-4 left-0 right-0 z-10 flex flex-col items-center ${remoteStream ? 'bg-black/30 py-2 rounded-lg mx-2' : ''}`}>
                                <p className="text-2xl font-mono mb-4">{formatTimer(timer)}</p>
                                <div className="flex space-x-4">
                                    <CallButton
                                        onClick={toggleAudio}
                                        bgColor={isAudioMuted ? "bg-red-600" : "bg-sky-700/50"}
                                        hoverColor={isAudioMuted ? "hover:bg-red-700" : "hover:bg-sky-800"}
                                        svgPath={isAudioMuted ? SVG_PATHS.mute : SVG_PATHS.unmute}
                                        size="w-12 h-12"
                                    />
                                    <CallButton
                                        onClick={handleEndCall}
                                        bgColor="bg-red-600"
                                        hoverColor="hover:bg-red-700"
                                        svgPath={SVG_PATHS.reject}
                                        size="w-14 h-14"
                                    />
                                    <CallButton
                                        onClick={toggleVideo}
                                        bgColor={isVideoOff ? "bg-red-600" : "bg-sky-700/50"}
                                        hoverColor={isVideoOff ? "hover:bg-red-700" : "hover:bg-sky-800"}
                                        svgPath={isVideoOff ? SVG_PATHS.videoOff : SVG_PATHS.videoOn}
                                        size="w-12 h-12"
                                    />
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="flex flex-col items-center mb-8">
                                    {renderFriendImage()}
                                    <p className="text-2xl font-mono mb-4">{formatTimer(timer)}</p>
                                    <h2 className="text-3xl font-bold mt-4">Call with {friend?.name || 'Unknown'}</h2>
                                </div>
                                <div className="flex space-x-4 mb-8">
                                    <CallButton
                                        onClick={toggleAudio}
                                        bgColor={isAudioMuted ? "bg-red-600" : "bg-sky-700/50"}
                                        hoverColor={isAudioMuted ? "hover:bg-red-700" : "hover:bg-sky-800"}
                                        svgPath={isAudioMuted ? SVG_PATHS.mute : SVG_PATHS.unmute}
                                        size="w-12 h-12"
                                    />
                                    <CallButton
                                        onClick={handleEndCall}
                                        bgColor="bg-red-600"
                                        hoverColor="hover:bg-red-700"
                                        svgPath={SVG_PATHS.reject}
                                    />
                                </div>
                            </>
                        )}
                    </>
                )}

                {callStatus === 'rejected' && (
                    <>
                        {renderCommonHeader('Call Rejected')}
                        <div className="flex justify-center">
                            <CallButton
                                onClick={() => cleanupResources(0, 'renderCloseButton', true)}
                                bgColor="bg-sky-700/50"
                                hoverColor="hover:bg-sky-800"
                                svgPath={SVG_PATHS.reject}
                            />
                        </div>
                    </>
                )}

                {callStatus === 'ended' && (
                    <>
                        {renderCommonHeader('Call Ended')}
                        <div className="flex justify-center">
                            <CallButton
                                onClick={() => cleanupResources(0, 'renderCloseButton', true)}
                                bgColor="bg-sky-700/50"
                                hoverColor="hover:bg-sky-800"
                                svgPath={SVG_PATHS.reject}
                            />
                        </div>
                    </>
                )}

                {callStatus === 'error' && (
                    <>
                        <div className="flex flex-col items-center mb-8">
                            {renderFriendImage()}
                            <h2 className="text-3xl font-bold mt-4">Error in Call</h2>
                            <p className="text-xl text-red-200 text-center px-4">{error || 'Something went wrong. Please try again.'}</p>
                        </div>
                        <div className="flex justify-center">
                            <CallButton
                                onClick={() => cleanupResources(0, 'renderCloseButton', true)}
                                bgColor="bg-sky-700/50"
                                hoverColor="hover:bg-sky-800"
                                svgPath={SVG_PATHS.reject}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default CallModal;
