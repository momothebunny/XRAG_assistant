import { BookmarkPlus, CheckCircle2, ChevronDown, FileSearch, ImagePlus, Link2, Mic, Paperclip, Send, ThumbsDown, ThumbsUp, User, Workflow, X, Zap, AlertCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { xragApi } from '../../services/xragApi';

const SOURCE_PREVIEW_FALLBACKS = {
  'BCP_Plan_2024.pdf': {
    page: 12,
    chunkId: 'C-041',
    tokenCount: 83,
    snippet:
      'Critical operation cutover is allowed only after security audit closure and approval from the continuity owner. The failback checklist must be attached to the incident record.',
  },
  'Infra_Security_v2.docx': {
    page: 4,
    chunkId: 'C-019',
    tokenCount: 71,
    snippet:
      'Execution access for operational changes requires least-privilege entitlement and dual-control confirmation when the system impact level is high.',
  },
};

const parseSourceLabel = (source) => {
  if (typeof source === 'string') {
    return source;
  }

  return source?.label || source?.name || 'Unknown source';
};

const normalizeSource = (source) => {
  const label = parseSourceLabel(source);
  const pageMatch = label.match(/\(p\.(\d+)\)/i);
  const pageFromLabel = pageMatch ? Number(pageMatch[1]) : null;
  const name = label.replace(/\s*\(p\.\d+\)/i, '').trim();
  const fallback = SOURCE_PREVIEW_FALLBACKS[name] || {};

  return {
    label,
    name,
    page: source?.page || pageFromLabel || fallback.page || 1,
    chunkId: source?.chunkId || fallback.chunkId || 'C-001',
    tokenCount: source?.tokenCount || fallback.tokenCount || 64,
    snippet:
      source?.snippet ||
      fallback.snippet ||
      'Relevant evidence snippet for this answer. The selected context supports the generated response with grounded document content.',
  };
};

const ChatTab = ({
  messages,
  isTyping,
  chatEndRef,
  inputValue,
  setInputValue,
  onSendMessage,
  onSaveAnswer,
}) => {
  const [activeCitation, setActiveCitation] = useState(null);
  const [feedbackDraftByMessage, setFeedbackDraftByMessage] = useState({});
  const [submittedFeedbackByMessage, setSubmittedFeedbackByMessage] = useState({});
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [savedStateByMessage, setSavedStateByMessage] = useState({});
  const [canvasFlows, setCanvasFlows] = useState([]);
  const [selectedFlowId, setSelectedFlowId] = useState('');
  const [flowSelectorOpen, setFlowSelectorOpen] = useState(false);
  const audioInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const flowSelectorRef = useRef(null);

  useEffect(() => {
    xragApi.listCanvasFlows()
      .then((flows) => setCanvasFlows(Array.isArray(flows) ? flows : []))
      .catch(() => setCanvasFlows([]));
  }, []);

  useEffect(() => {
    if (!flowSelectorOpen) return undefined;
    const handleOutside = (e) => {
      if (flowSelectorRef.current && !flowSelectorRef.current.contains(e.target)) {
        setFlowSelectorOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [flowSelectorOpen]);

  const selectedFlow = canvasFlows.find((f) => f.id === selectedFlowId) || null;
  const activeSource = useMemo(() => {
    if (!activeCitation) {
      return null;
    }

    const targetMessage = messages[activeCitation.messageIndex];
    const targetSource = targetMessage?.sources?.[activeCitation.sourceIndex];
    if (!targetSource) {
      return null;
    }

    return normalizeSource(targetSource);
  }, [activeCitation, messages]);

  const toggleCitation = (messageIndex, sourceIndex) => {
    setActiveCitation((previous) => {
      if (previous && previous.messageIndex === messageIndex && previous.sourceIndex === sourceIndex) {
        return null;
      }

      return { messageIndex, sourceIndex };
    });
  };

  const startFeedback = (messageIndex, sentiment) => {
    if (sentiment === 'up') {
      setSubmittedFeedbackByMessage((previousFeedback) => ({
        ...previousFeedback,
        [messageIndex]: {
          sentiment: 'up',
          correctionSource: '',
          reason: 'Marked as helpful by user.',
          submittedAt: Date.now(),
        },
      }));

      setFeedbackDraftByMessage((previousDrafts) => {
        const nextDrafts = { ...previousDrafts };
        delete nextDrafts[messageIndex];
        return nextDrafts;
      });

      return;
    }

    setFeedbackDraftByMessage((previousDrafts) => ({
      ...previousDrafts,
      [messageIndex]: {
        sentiment,
        correctionSource: '',
        reason: '',
      },
    }));
  };

  const updateFeedback = (messageIndex, field, value) => {
    setFeedbackDraftByMessage((previousDrafts) => ({
      ...previousDrafts,
      [messageIndex]: {
        ...previousDrafts[messageIndex],
        [field]: value,
      },
    }));
  };

  const submitFeedback = (messageIndex) => {
    const feedbackDraft = feedbackDraftByMessage[messageIndex];
    if (!feedbackDraft?.reason?.trim()) {
      return;
    }

    setSubmittedFeedbackByMessage((previousFeedback) => ({
      ...previousFeedback,
      [messageIndex]: {
        ...feedbackDraft,
        submittedAt: Date.now(),
      },
    }));

    setFeedbackDraftByMessage((previousDrafts) => {
      const nextDrafts = { ...previousDrafts };
      delete nextDrafts[messageIndex];
      return nextDrafts;
    });
  };

  const attachmentKindByMime = (mimeType, fallbackKind) => {
    if (mimeType?.startsWith('audio/')) {
      return 'audio';
    }

    if (mimeType?.startsWith('image/')) {
      return 'image';
    }

    return fallbackKind || 'file';
  };

  const addAttachments = (fileList, fallbackKind = 'file') => {
    const files = Array.from(fileList || []);
    if (!files.length) {
      return;
    }

    const nextAttachments = files.map((file, index) => ({
      id: `${file.name}-${file.size}-${Date.now()}-${index}`,
      name: file.name,
      size: file.size,
      mimeType: file.type,
      kind: attachmentKindByMime(file.type, fallbackKind),
    }));

    setPendingAttachments((previousAttachments) => [...previousAttachments, ...nextAttachments]);
  };

  const removePendingAttachment = (attachmentId) => {
    setPendingAttachments((previousAttachments) => previousAttachments.filter((attachment) => attachment.id !== attachmentId));
  };

  const openPicker = (pickerType) => {
    if (pickerType === 'audio') {
      audioInputRef.current?.click();
      return;
    }

    if (pickerType === 'image') {
      imageInputRef.current?.click();
      return;
    }

    fileInputRef.current?.click();
  };

  const resetFileInputs = () => {
    if (audioInputRef.current) {
      audioInputRef.current.value = '';
    }

    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatAttachmentSize = (sizeInBytes) => {
    if (!sizeInBytes) {
      return '0 B';
    }

    if (sizeInBytes < 1024) {
      return `${sizeInBytes} B`;
    }

    if (sizeInBytes < 1024 * 1024) {
      return `${Math.round(sizeInBytes / 1024)} KB`;
    }

    return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const attachmentLabel = (kind) => {
    if (kind === 'audio') {
      return 'Audio';
    }

    if (kind === 'image') {
      return 'Image';
    }

    return 'File';
  };

  const handleMessageSubmit = (event) => {
    const sent = onSendMessage(event, pendingAttachments, selectedFlowId || null);
    if (!sent) {
      return;
    }

    setPendingAttachments([]);
    resetFileInputs();
  };

  const saveAnswerToDatabase = async (messageIndex, message) => {
    const wasAdded = await onSaveAnswer({
      content: message.content,
      reasoning: message.reasoning,
      sources: message.sources,
      promptReference: message.promptReference,
    });

    setSavedStateByMessage((previousStates) => ({
      ...previousStates,
      [messageIndex]: wasAdded ? 'saved' : 'exists',
    }));
  };

  return (
    <div data-xrag-tab="chat" className="xrag-chat-theme flex h-full flex-col bg-slate-950 text-slate-100">

      {/* ── Flow selector bar ─────────────────────────────────────── */}
      <div className="shrink-0 border-b border-slate-800 bg-slate-950 px-4 py-2 md:px-6">
        <div className="mx-auto flex max-w-4xl items-center gap-2.5">
          <Workflow size={13} className="shrink-0 text-amber-400/70" />
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Flow</span>

          <div ref={flowSelectorRef} className="relative">
            <button
              type="button"
              onClick={() => setFlowSelectorOpen((o) => !o)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-black uppercase tracking-wide transition-all ${
                selectedFlow
                  ? 'border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                  : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-amber-500/40 hover:text-amber-300'
              }`}
            >
              {selectedFlow ? selectedFlow.name : 'Default RAG'}
              <ChevronDown size={11} className={`transition-transform ${flowSelectorOpen ? 'rotate-180' : ''}`} />
            </button>

            {flowSelectorOpen && (
              <div className="absolute left-0 top-full z-30 mt-1.5 min-w-[220px] max-h-48 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/70">
                <button
                  type="button"
                  onClick={() => { setSelectedFlowId(''); setFlowSelectorOpen(false); }}
                  className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-[11px] font-bold transition-colors hover:bg-slate-800 ${
                    !selectedFlowId ? 'text-amber-300' : 'text-slate-400'
                  }`}
                >
                  <Zap size={12} className="shrink-0" /> Default RAG — no flow
                </button>

                {canvasFlows.length > 0 && (
                  <div className="border-t border-slate-800">
                    {canvasFlows.map((flow) => (
                      <button
                        key={flow.id}
                        type="button"
                        onClick={() => { setSelectedFlowId(flow.id); setFlowSelectorOpen(false); }}
                        className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-[11px] font-bold transition-colors hover:bg-slate-800 ${
                          selectedFlowId === flow.id ? 'text-amber-300' : 'text-slate-300'
                        }`}
                      >
                        <Workflow size={12} className="shrink-0 text-amber-500/60" />
                        <span className="truncate">{flow.name || flow.id}</span>
                      </button>
                    ))}
                  </div>
                )}

                {canvasFlows.length === 0 && (
                  <p className="border-t border-slate-800 px-4 py-3 text-[10px] text-slate-500">
                    No saved flows yet — build one in Canvas.
                  </p>
                )}
              </div>
            )}
          </div>

          {selectedFlow && (
            <button
              type="button"
              onClick={() => setSelectedFlowId('')}
              title="Clear flow selection"
              className="flex h-6 w-6 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-500 hover:border-amber-500/40 hover:text-amber-300"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        {messages.map((message, messageIndex) => (
          <div key={messageIndex} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] flex gap-4 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                  message.role === 'user' ? 'xrag-user-avatar bg-amber-400 border border-amber-300' : 'bg-slate-900 border border-slate-700'
                }`}
              >
                {message.role === 'user' ? (
                  <User size={20} className="text-slate-950" />
                ) : (
                  <Zap size={20} className="text-amber-300" />
                )}
              </div>
              <div className="space-y-2">
                {message.role === 'assistant' && submittedFeedbackByMessage[messageIndex] && (
                  <div className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-slate-900 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-amber-300">
                    <CheckCircle2 size={12} />
                    {submittedFeedbackByMessage[messageIndex].sentiment === 'up' ? 'Helpful feedback saved' : 'Correction feedback saved'}
                  </div>
                )}
                <div
                  className={`p-5 rounded-2xl shadow-sm border ${
                    message.role === 'user'
                      ? 'xrag-user-bubble bg-amber-400 text-slate-950 border-amber-300 rounded-tr-none'
                      : 'bg-slate-900 text-slate-100 border-slate-700 rounded-tl-none'
                  }`}
                >
                  <p className="text-sm leading-relaxed">{message.content}</p>

                  {/* ── Canvas flow trace ── */}
                  {message.flowTrace?.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-800">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Flow trace</p>
                      <div className="flex flex-wrap gap-1.5">
                        {message.flowTrace.map((step, si) => (
                          <span
                            key={si}
                            title={step.error || ''}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                              step.status === 'error'
                                ? 'border-rose-500/40 bg-rose-500/10 text-rose-400'
                                : 'border-amber-500/30 bg-slate-800 text-amber-300'
                            }`}
                          >
                            {step.status === 'error' ? <AlertCircle size={10} /> : <Zap size={10} />}
                            {step.label}
                            <span className="text-slate-500 font-normal">{step.duration_ms}ms</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {message.promptReference && (
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-slate-950 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-amber-300">
                      <Link2 size={11} /> Prompt ref: {message.promptReference}
                    </div>
                  )}
                  {message.attachments?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {message.attachments.map((attachment) => (
                        <span
                          key={attachment.id}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider ${
                            message.role === 'user'
                              ? 'bg-amber-200/90 border-amber-500/60 text-slate-900'
                              : 'bg-slate-950 border-slate-700 text-slate-300'
                          }`}
                        >
                          <Paperclip size={11} /> {attachmentLabel(attachment.kind)} · {attachment.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {message.sources?.length > 0 && (
                    <div className="mt-3 relative space-y-2">
                      <div className="flex flex-wrap gap-2">
                      {message.sources.map((source, sourceIndex) => (
                        <button
                          key={sourceIndex}
                          type="button"
                          onClick={() => toggleCitation(messageIndex, sourceIndex)}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold border transition-colors ${
                            activeCitation?.messageIndex === messageIndex && activeCitation?.sourceIndex === sourceIndex
                              ? 'bg-amber-500 text-slate-950 border-amber-400'
                              : 'bg-slate-950 text-amber-300 border-slate-700 hover:bg-slate-900'
                          }`}
                        >
                          <FileSearch size={12} /> {parseSourceLabel(source)}
                        </button>
                      ))}
                    </div>
                      {activeCitation?.messageIndex === messageIndex && activeSource && (
                        <div className="absolute left-0 right-0 z-20 mt-1 rounded-2xl border border-slate-700 bg-slate-950 p-4 shadow-[0_16px_40px_rgba(0,0,0,0.45)] space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-black tracking-tight text-amber-200">Citation Preview</p>
                            <button
                              type="button"
                              onClick={() => setActiveCitation(null)}
                              className="text-[10px] font-black uppercase text-slate-400 hover:text-amber-300"
                            >
                              Close
                            </button>
                          </div>
                          <p className="text-[11px] font-bold text-slate-400">{activeSource.name}</p>
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-black uppercase tracking-wider">
                            <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-300">p. {activeSource.page}</span>
                            <span className="rounded-full border border-amber-500/40 bg-slate-900 px-2 py-0.5 text-amber-300">{activeSource.chunkId}</span>
                            <span className="rounded-full border border-amber-500/40 bg-slate-900 px-2 py-0.5 text-amber-300">{activeSource.tokenCount} tokens</span>
                          </div>
                          <p className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs leading-6 text-slate-200">“{activeSource.snippet}”</p>
                        </div>
                      )}
                    </div>
                  )}

                  {message.role === 'assistant' && (
                    <div className="mt-4 border-t border-slate-800 pt-3">
                      <div className="mb-3">
                        <button
                          type="button"
                          onClick={() => {
                            void saveAnswerToDatabase(messageIndex, message);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-slate-950 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-amber-300 transition-colors hover:bg-slate-900"
                        >
                          <BookmarkPlus size={12} /> Save answer to database
                        </button>
                        {savedStateByMessage[messageIndex] === 'saved' && (
                          <span className="ml-2 text-[10px] font-black uppercase tracking-wider text-amber-300">Saved</span>
                        )}
                        {savedStateByMessage[messageIndex] === 'exists' && (
                          <span className="ml-2 text-[10px] font-black uppercase tracking-wider text-slate-400">Already saved</span>
                        )}
                      </div>

                      {!submittedFeedbackByMessage[messageIndex] && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Human feedback</span>
                          <button
                            type="button"
                            onClick={() => startFeedback(messageIndex, 'up')}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-slate-950 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-300 transition-colors hover:bg-slate-900"
                          >
                            <ThumbsUp size={12} /> Helpful
                          </button>
                          <button
                            type="button"
                            onClick={() => startFeedback(messageIndex, 'down')}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-slate-950 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-300 transition-colors hover:bg-slate-900"
                          >
                            <ThumbsDown size={12} /> Needs correction
                          </button>
                        </div>
                      )}

                      {feedbackDraftByMessage[messageIndex] && (
                        <div className="mt-3 space-y-2 rounded-xl border border-slate-700 bg-slate-950 p-3">
                          {feedbackDraftByMessage[messageIndex].sentiment === 'down' && (
                            <div>
                              <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">Correct source</label>
                              <select
                                value={feedbackDraftByMessage[messageIndex].correctionSource}
                                onChange={(event) => updateFeedback(messageIndex, 'correctionSource', event.target.value)}
                                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs font-bold text-slate-100 outline-none focus:ring-1 focus:ring-amber-400"
                              >
                                <option value="">Select a better source...</option>
                                {(message.sources || []).map((source, sourceIndex) => (
                                  <option key={sourceIndex} value={parseSourceLabel(source)}>
                                    {parseSourceLabel(source)}
                                  </option>
                                ))}
                                <option value="Other internal policy file">Other internal policy file</option>
                              </select>
                            </div>
                          )}

                          <div>
                            <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">Short reason</label>
                            <textarea
                              rows={2}
                              value={feedbackDraftByMessage[messageIndex].reason}
                              onChange={(event) => updateFeedback(messageIndex, 'reason', event.target.value)}
                              placeholder="Why should the answer be improved?"
                              className="w-full resize-none rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs font-medium text-slate-100 outline-none focus:ring-1 focus:ring-amber-400"
                            />
                          </div>

                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setFeedbackDraftByMessage((previousDrafts) => {
                                  const nextDrafts = { ...previousDrafts };
                                  delete nextDrafts[messageIndex];
                                  return nextDrafts;
                                });
                              }}
                              className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-300 hover:bg-slate-800"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => submitFeedback(messageIndex)}
                              disabled={!feedbackDraftByMessage[messageIndex].reason?.trim()}
                              className="rounded-lg border border-amber-400 bg-amber-500 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Submit feedback
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex gap-4 items-center pl-14">
            <div className="flex gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-200 animate-bounce" style={{ animationDelay: '0ms' }}></span>
              <span className="h-2 w-2 rounded-full bg-amber-300 animate-bounce" style={{ animationDelay: '150ms' }}></span>
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '300ms' }}></span>
            </div>
            <span className="text-xs font-medium uppercase tracking-widest text-slate-400">XRAG analysis in progress...</span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
      <div className="border-t border-slate-800 bg-slate-950 p-4 md:p-6">
        <form onSubmit={handleMessageSubmit} className="max-w-4xl mx-auto space-y-3">
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/*"
            multiple
            className="hidden"
            onChange={(event) => addAttachments(event.target.files, 'audio')}
          />
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => addAttachments(event.target.files, 'image')}
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => addAttachments(event.target.files, 'file')}
          />

          <div className="rounded-2xl border border-slate-700 bg-slate-900 shadow-inner px-3 py-2">
            {pendingAttachments.length > 0 && (
              <div className="mb-2.5 flex flex-wrap gap-2 border-b border-slate-800 pb-2.5">
                {pendingAttachments.map((attachment) => (
                  <span key={attachment.id} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-[10px] font-bold text-slate-200">
                    <Paperclip size={11} />
                    {attachment.name}
                    <span className="text-slate-400">({formatAttachmentSize(attachment.size)})</span>
                    <button
                      type="button"
                      onClick={() => removePendingAttachment(attachment.id)}
                      className="text-slate-400 hover:text-amber-300"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => openPicker('audio')}
                  title="Hang feltöltése"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-950 text-slate-300 transition-colors hover:border-amber-400 hover:text-amber-300"
                >
                  <Mic size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => openPicker('image')}
                  title="Kép feltöltése"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-950 text-slate-300 transition-colors hover:border-amber-400 hover:text-amber-300"
                >
                  <ImagePlus size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => openPicker('file')}
                  title="Fájl feltöltése"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-950 text-slate-300 transition-colors hover:border-amber-400 hover:text-amber-300"
                >
                  <Paperclip size={14} />
                </button>
              </div>

              <div className="h-6 w-px shrink-0 bg-slate-700"></div>

              <input
                type="text"
                placeholder={selectedFlow ? `Ask using "${selectedFlow.name}"…` : 'Ask anything…'}
                className="min-w-0 flex-1 border-none bg-transparent px-1 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
              />

              {pendingAttachments.length > 0 && (
                <span className="hidden shrink-0 rounded-full border border-amber-500/40 bg-slate-950 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-amber-300 sm:inline-flex">
                  {pendingAttachments.length} selected
                </span>
              )}

              <button
                type="submit"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-slate-950 shadow-lg transition-all transition-transform hover:bg-amber-400 active:scale-95"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChatTab;
