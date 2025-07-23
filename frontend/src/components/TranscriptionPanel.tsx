import React from 'react';
import { MessageSquare, User, Users } from 'lucide-react';

interface TranscriptionMessage {
  id: string;
  text: string;
  speaker: 'local' | 'remote';
  timestamp: Date;
  isFinal: boolean;
}

interface TranscriptionPanelProps {
  transcriptions: TranscriptionMessage[];
  isListening: boolean;
  onToggleListening: () => void;
}

export const TranscriptionPanel: React.FC<TranscriptionPanelProps> = ({
  transcriptions,
  isListening,
  onToggleListening,
}) => {
  return (
    <div className="bg-black/30 backdrop-blur-lg rounded-2xl p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <MessageSquare className="w-5 h-5 text-white" />
          <h3 className="text-white font-semibold">Live Transcription</h3>
        </div>
        <button
          onClick={onToggleListening}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            isListening
              ? 'bg-red-600 hover:bg-red-500 text-white'
              : 'bg-green-600 hover:bg-green-500 text-white'
          }`}
        >
          {isListening ? 'Stop' : 'Start'}
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto space-y-2 max-h-64">
        {transcriptions.length === 0 ? (
          <div className="text-center text-slate-400 py-8">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Speech transcription will appear here</p>
          </div>
        ) : (
          transcriptions.map((transcription) => (
            <div
              key={transcription.id}
              className={`p-3 rounded-lg ${
                transcription.speaker === 'local'
                  ? 'bg-blue-600/20 border-l-4 border-blue-500'
                  : 'bg-green-600/20 border-l-4 border-green-500'
              }`}
            >
              <div className="flex items-center space-x-2 mb-1">
                {transcription.speaker === 'local' ? (
                  <User className="w-4 h-4 text-blue-400" />
                ) : (
                  <Users className="w-4 h-4 text-green-400" />
                )}
                <span className={`text-xs font-medium ${
                  transcription.speaker === 'local' ? 'text-blue-400' : 'text-green-400'
                }`}>
                  {transcription.speaker === 'local' ? 'You' : 'Remote'}
                </span>
                <span className="text-xs text-slate-400">
                  {transcription.timestamp.toLocaleTimeString()}
                </span>
              </div>
              <p className={`text-sm ${
                transcription.isFinal ? 'text-white' : 'text-slate-300 italic'
              }`}>
                {transcription.text}
                {!transcription.isFinal && <span className="animate-pulse">...</span>}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};