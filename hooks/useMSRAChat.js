// hooks/useMSRAChat.js - Hook to handle MSRA chat with thinking panel events

import { useState, useCallback } from 'react';

export function useMSRAChat() {
  const [isThinking, setIsThinking] = useState(false);
  const [showThinkingPanel, setShowThinkingPanel] = useState(false);

  const sendMessage = useCallback(async (message, sessionId, showThinking = false) => {
    setIsThinking(true);
    if (showThinking) {
      setShowThinkingPanel(true);
    }

    try {
      const response = await fetch('/api/MSRAChatbot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: message,
          sessionId,
          showThinking,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('event: thinking')) {
            // Next line should be the data
            continue;
          }
          
          if (line.startsWith('data: ')) {
            try {
              const eventData = JSON.parse(line.slice(6));
              
              // Dispatch custom event for ThinkingPanel to listen to
              const thinkingEvent = new CustomEvent('thinking', {
                detail: eventData
              });
              window.dispatchEvent(thinkingEvent);
            } catch (e) {
              // Not JSON data, might be answer text
              fullResponse += line.slice(6);
            }
          } else if (line.trim() && !line.startsWith('event:')) {
            // Regular streaming text
            fullResponse += line;
          }
        }
      }

      setIsThinking(false);
      return fullResponse;

    } catch (error) {
      console.error('Error sending message:', error);
      setIsThinking(false);
      throw error;
    }
  }, []);

  return {
    sendMessage,
    isThinking,
    showThinkingPanel,
    setShowThinkingPanel,
  };
}