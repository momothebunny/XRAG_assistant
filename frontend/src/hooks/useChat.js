import { useEffect, useRef, useState } from 'react';

export const useChat = (selectedDBName, aiConfig) => {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        'Welcome to the XRAG (Explainable RAG) interface. The system is ready for deep document analysis and reasoning-trace visualization.',
      reasoning: `System initialized. Active vector store: ${selectedDBName}`,
      traceSteps: [
        { label: 'Boot', duration: '52 ms' },
        { label: 'Health', duration: '41 ms' },
        { label: 'Index', duration: '88 ms' },
        { label: 'Ready', duration: '34 ms' },
      ],
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

  const handleSendMessage = (event, attachments = [], options = {}) => {
    event.preventDefault();

    if (!inputValue.trim() && attachments.length === 0) {
      return false;
    }

    const userMessage = {
      role: 'user',
      content: inputValue.trim() || 'Please analyze these uploaded attachments.',
      attachments,
      promptReference: options.promptReference || null,
    };
    setMessages((previousMessages) => [...previousMessages, userMessage]);
    setInputValue('');
    setIsTyping(true);

    setTimeout(() => {
      const assistantMessage = {
        role: 'assistant',
        content:
          attachments.length > 0
            ? `I processed the uploaded attachments and cross-checked them with ${selectedDBName}. The answer is grounded and consistent with the indexed policy context.`
            : `Based on the analyzed documents, the answer is supported. According to ${selectedDBName} vector search, the BCP 2024 plan is authoritative, which means the requested operation can be executed after the security audit.`,
        reasoning:
          `1. Search: Semantic similarity analysis. 2. Filter: Relevant context extraction (Score > 0.88). 3. Explainability: Cross-checking the supporting paragraphs. 4. Runtime: model=${aiConfig?.model || 'GPT-4o'}, temp=${aiConfig?.temperature ?? 0.7}, strict=${
            aiConfig?.strictMode ? 'ON' : 'OFF'
          }${options.promptReference ? `, preset=${options.promptReference}` : ''}.`,
        traceSteps: [
          { label: 'Search', duration: '132 ms' },
          { label: 'Filter', duration: '95 ms' },
          { label: 'Ground', duration: '142 ms' },
          { label: 'Answer', duration: '71 ms' },
        ],
        sources: [
          {
            label: 'BCP_Plan_2024.pdf (p.12)',
            page: 12,
            chunkId: 'C-041',
            tokenCount: 83,
            snippet:
              'Critical operation cutover is allowed only after security audit closure and approval from the continuity owner. The failback checklist must be attached to the incident record.',
          },
          {
            label: 'Infra_Security_v2.docx',
            page: 4,
            chunkId: 'C-019',
            tokenCount: 71,
            snippet:
              'Execution access for operational changes requires least-privilege entitlement and dual-control confirmation when the system impact level is high.',
          },
        ],
      };

      setMessages((previousMessages) => [...previousMessages, assistantMessage]);
      setIsTyping(false);
    }, 1800);

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
