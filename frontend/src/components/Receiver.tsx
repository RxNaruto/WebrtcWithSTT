import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Users } from "lucide-react";
import { VideoControls } from "./VideoControls";
import { ConnectionStatus } from "./ConnectionStatus";
import { TranscriptionPanel } from "./TranscriptionPanel";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";

interface TranscriptionMessage {
    id: string;
    text: string;
    speaker: 'local' | 'remote';
    timestamp: Date;
    isFinal: boolean;
}

export const Receiver = () => {
    const [socket, setSocket] = useState<null | WebSocket>(null);
    const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
    const [isCallStarted, setIsCallStarted] = useState(false);
    const [isAudioEnabled, setIsAudioEnabled] = useState(true);
    const [isVideoEnabled, setIsVideoEnabled] = useState(true);
    const [participantCount, setParticipantCount] = useState(1);
    const [transcriptions, setTranscriptions] = useState<TranscriptionMessage[]>([]);
    const [isSpeechEnabled, setIsSpeechEnabled] = useState(false);
    const currentInterimRef = useRef<string>('');
    
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

    const handleTranscription = (text: string, isFinal: boolean) => {
        const now = new Date();
        const id = `${now.getTime()}-local`;

        if (isFinal) {
            // Send final transcription to remote user
            if (socket) {
                socket.send(JSON.stringify({
                    type: 'transcription',
                    text: text,
                    isFinal: true,
                    target: 'sender'
                }));
            }

            // Add final transcription to local state
            setTranscriptions(prev => {
                // Remove any interim message and add final one
                const filtered = prev.filter(t => t.id !== `interim-local`);
                return [...filtered, {
                    id,
                    text,
                    speaker: 'local',
                    timestamp: now,
                    isFinal: true
                }];
            });
            currentInterimRef.current = '';
        } else {
            // Handle interim results
            if (text !== currentInterimRef.current) {
                currentInterimRef.current = text;
                setTranscriptions(prev => {
                    const filtered = prev.filter(t => t.id !== `interim-local`);
                    return [...filtered, {
                        id: `interim-local`,
                        text,
                        speaker: 'local',
                        timestamp: now,
                        isFinal: false
                    }];
                });
            }
        }
    };

    const { isListening, isSupported, toggleListening } = useSpeechRecognition({
        onTranscription: handleTranscription,
        isEnabled: isSpeechEnabled && isCallStarted
    });

    useEffect(() => {
        const socket = new WebSocket('wss://webrtc2way.rithkchaudharytechnologies.xyz/ws/');
        
        socket.onopen = () => {
            socket.send(JSON.stringify({ type: 'receiver' }));
            setConnectionStatus('connected');
        };
        
        socket.onclose = () => {
            setConnectionStatus('disconnected');
        };
        
        socket.onerror = () => {
            setConnectionStatus('disconnected');
        };

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            // Handle transcription messages
            if (data.type === 'transcription') {
                const now = new Date();
                const id = `${now.getTime()}-remote`;
                
                if (data.isFinal) {
                    setTranscriptions(prev => {
                        const filtered = prev.filter(t => t.id !== `interim-remote`);
                        return [...filtered, {
                            id,
                            text: data.text,
                            speaker: 'remote',
                            timestamp: now,
                            isFinal: true
                        }];
                    });
                } else {
                    setTranscriptions(prev => {
                        const filtered = prev.filter(t => t.id !== `interim-remote`);
                        return [...filtered, {
                            id: `interim-remote`,
                            text: data.text,
                            speaker: 'remote',
                            timestamp: now,
                            isFinal: false
                        }];
                    });
                }
            }
        };
        
        setSocket(socket);

        return () => {
            socket.close();
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    async function startSendingVideo() {
        if (!socket) return;
        
        setIsCallStarted(true);
        setConnectionStatus('connecting');

        try {
            // Fetch dynamic ICE servers
            const response = await fetch("https://mycapstoneturnserver.metered.live/api/v1/turn/credentials?apiKey=49c30365ef3c75870c2e02da41af28ba0a40");
            const iceServers = await response.json();

            const peerConnection = new RTCPeerConnection({ iceServers });
            peerConnectionRef.current = peerConnection;

            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.send(JSON.stringify({ type: 'iceCandidate', candidate: event.candidate, target: 'sender' }));
                }
            };

            peerConnection.ontrack = (event) => {
                console.log('Received track from sender!', event);
                if (remoteVideoRef.current) {
                    remoteVideoRef.current.srcObject = event.streams[0];
                    setParticipantCount(2);
                }
            };

            const handleWebRTCMessage = async (event: MessageEvent) => {
                const data = JSON.parse(event.data);

                // Handle transcription messages
                if (data.type === 'transcription') {
                    const now = new Date();
                    const id = `${now.getTime()}-remote`;
                    
                    if (data.isFinal) {
                        setTranscriptions(prev => {
                            const filtered = prev.filter(t => t.id !== `interim-remote`);
                            return [...filtered, {
                                id,
                                text: data.text,
                                speaker: 'remote',
                                timestamp: now,
                                isFinal: true
                            }];
                        });
                    }
                    return;
                }

                if (data.type === 'createOffer') {
                    await peerConnection.setRemoteDescription(data.sdp);

                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    socket.send(JSON.stringify({ type: 'createAnswer', sdp: peerConnection.localDescription, target: 'sender' }));
                    setConnectionStatus('connected');
                }
                else if (data.type === 'createAnswer') {
                    await peerConnection.setRemoteDescription(data.sdp);
                }
                else if (data.type === 'iceCandidate') {
                    await peerConnection.addIceCandidate(data.candidate);
                }
            };

            socket.onmessage = handleWebRTCMessage;

            // Get local stream (video + audio)
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            streamRef.current = stream;
            
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }
            
            stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.send(JSON.stringify({ type: 'createOffer', sdp: peerConnection.localDescription, target: 'sender' }));
        } catch (error) {
            console.error('Error starting video call:', error);
            setConnectionStatus('disconnected');
        }
    }

    const toggleAudio = () => {
        if (streamRef.current) {
            const audioTrack = streamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsAudioEnabled(audioTrack.enabled);
            }
        }
    };

    const toggleVideo = () => {
        if (streamRef.current) {
            const videoTrack = streamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setIsVideoEnabled(videoTrack.enabled);
            }
        }
    };

    const endCall = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
        }
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
        }
        setIsCallStarted(false);
        setConnectionStatus('disconnected');
        setParticipantCount(1);
        setTranscriptions([]);
        setIsSpeechEnabled(false);
    };

    const handleToggleSpeech = () => {
        if (!isSupported) {
            alert('Speech recognition is not supported in your browser');
            return;
        }
        setIsSpeechEnabled(!isSpeechEnabled);
        if (!isSpeechEnabled) {
            toggleListening();
        }
    };

    return (
        <div className="min-h-screen p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <Link
                    to="/"
                    className="inline-flex items-center space-x-2 text-white hover:text-blue-400 transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span>Back to Home</span>
                </Link>
                
                <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2 text-white">
                        <Users className="w-5 h-5" />
                        <span>{participantCount}/2</span>
                    </div>
                    <ConnectionStatus status={connectionStatus} role="receiver" />
                </div>
            </div>

            {!isCallStarted ? (
                /* Pre-call screen */
                <div className="flex items-center justify-center min-h-[80vh]">
                    <div className="text-center max-w-md">
                        <div className="w-24 h-24 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Users className="w-12 h-12 text-white" />
                        </div>
                        <h2 className="text-3xl font-bold text-white mb-4">Ready to Join</h2>
                        <p className="text-slate-300 mb-8">
                            Click the button below to join the video call and connect with the host.
                        </p>
                        <button
                            onClick={startSendingVideo}
                            className="bg-green-600 hover:bg-green-500 text-white px-8 py-4 rounded-xl font-semibold transition-all duration-200 hover:scale-105"
                        >
                            Join Video Call
                        </button>
                    </div>
                </div>
            ) : (
                /* Video call screen */
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-[calc(100vh-120px)]">
                    {/* Remote video (main) */}
                    <div className="lg:col-span-2 relative bg-slate-800 rounded-2xl overflow-hidden">
                        <video
                            ref={remoteVideoRef}
                            autoPlay
                            playsInline
                            className="w-full h-full object-cover"
                        />
                        {participantCount === 1 && (
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
                                <div className="text-center">
                                    <Users className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                                    <p className="text-slate-300 text-lg">Connecting to host...</p>
                                </div>
                            </div>
                        )}
                        
                        {/* Local video (picture-in-picture) */}
                        <div className="absolute top-4 right-4 w-48 h-36 bg-slate-900 rounded-lg overflow-hidden border-2 border-white/20">
                            <video
                                ref={localVideoRef}
                                autoPlay
                                playsInline
                                muted
                                className="w-full h-full object-cover"
                            />
                            <div className="absolute bottom-2 left-2 text-xs text-white bg-black/50 px-2 py-1 rounded">
                                You
                            </div>
                        </div>
                    </div>

                    {/* Controls and Transcription sidebar */}
                    <div className="lg:col-span-2 flex flex-col space-y-4">
                        <div className="flex-shrink-0">
                            <VideoControls
                                isAudioEnabled={isAudioEnabled}
                                isVideoEnabled={isVideoEnabled}
                                isConnected={connectionStatus === 'connected'}
                                onToggleAudio={toggleAudio}
                                onToggleVideo={toggleVideo}
                                onEndCall={endCall}
                            />
                        </div>
                        
                        {isCallStarted && (
                            <div className="flex-1 min-h-0">
                                <div className="mb-4">
                                    <button
                                        onClick={handleToggleSpeech}
                                        disabled={!isSupported}
                                        className={`w-full px-4 py-2 rounded-lg font-medium transition-colors ${
                                            isSpeechEnabled
                                                ? 'bg-green-600 hover:bg-green-500 text-white'
                                                : 'bg-slate-600 hover:bg-slate-500 text-white'
                                        } ${!isSupported ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        {isSpeechEnabled ? 'Live Chat: ON' : 'Enable Live Chat'}
                                    </button>
                                    {!isSupported && (
                                        <p className="text-xs text-red-400 mt-1 text-center">
                                            Speech recognition not supported in this browser
                                        </p>
                                    )}
                                </div>
                                
                                {isSpeechEnabled && (
                                    <TranscriptionPanel
                                        transcriptions={transcriptions}
                                        isListening={isListening}
                                        onToggleListening={toggleListening}
                                    />
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};