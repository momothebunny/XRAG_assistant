import { useEffect, useRef, useState } from 'react';
import { xragApi } from '../services/xragApi';

export const useChat = (selectedDBName) => {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        'Welcome to the XRAG (Explainable RAG) interface. The system is ready for deep document analysis and reasoning-trace visualization.',
      sources: [],
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    setMessages((previousMessages) => {
      if (previousMessages.length === 0) {
        return previousMessages;
      }

      const firstMessage = previousMessages[0];
      if (firstMessage.role !== 'assistant') {
        return previousMessages;
      }

      const updatedFirstMessage = {
        ...firstMessage,
        reasoning: `System initialized. Active vector store: ${selectedDBName}`,
      };

      return [updatedFirstMessage, ...previousMessages.slice(1)];
    });
  }, [selectedDBName]);

  const handleSendMessage = (event, attachments = [], flowId = null) => {
    event.preventDefault();

    if (!inputValue.trim() && attachments.length === 0) {
      return false;
    }

    const userMessage = {
      role: 'user',
      content: inputValue.trim() || 'Please analyze these uploaded attachments.',
      attachments,
    };
    setMessages((previousMessages) => [...previousMessages, userMessage]);
    setInputValue('');
    setIsTyping(true);

    const apiCall = flowId
      ? xragApi
          .runCanvasFlow({ flow_id: flowId, question: userMessage.content, inputs: { question: userMessage.content } })
          .then((result) => ({
            content: result.answer || result.final_outputs?.answer || result.final_outputs?.text || '[No answer returned by flow]',
            reasoning: result.reasoning || result.trace?.map((t) => `${t.label} (${t.duration_ms}ms)`).join(' → ') || '',
            traceSteps: (result.trace || []).map((t) => ({ label: t.label, duration: `${t.duration_ms} ms` })),
            sources: [],
            flowTrace: result.trace || [],
          }))
      : xragApi.chat({
          message: userMessage.content,
          attachments: userMessage.attachments,
        });

    apiCall
      .then((assistantMessage) => {
        setMessages((previousMessages) => [...previousMessages, { role: 'assistant', ...assistantMessage }]);
      })
      .catch(() => {
        setMessages((previousMessages) => [
          ...previousMessages,
          {
            role: 'assistant',
            content: flowId
              ? 'The canvas flow could not be reached. Make sure the backend is running and the flow is saved.'
              : `Backend is currently unavailable. Showing fallback response for ${selectedDBName}.`,
            reasoning: 'Fallback mode activated because the backend did not respond.',
            traceSteps: [
              { label: 'Fallback', duration: '3 ms' },
              { label: 'Answer', duration: '8 ms' },
            ],
            sources: [],
          },
        ]);
      })
      .finally(() => {
        setIsTyping(false);
      });

    return true;
  };

  return {
    messages,
    inputValue,
    isTyping,
    chatEndRef,
    setInputValue,
    handleSendMessage,
  };
};
