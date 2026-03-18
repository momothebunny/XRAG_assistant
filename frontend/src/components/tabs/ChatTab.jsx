import { CheckCircle2, FileSearch, ImagePlus, Mic, Paperclip, Send, ThumbsDown, ThumbsUp, User, X, Zap } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import ReasoningGraph from '../chat/ReasoningGraph';

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

const ChatTab = ({ messages, isTyping, chatEndRef, inputValue, setInputValue, onSendMessage }) => {
  const [activeCitation, setActiveCitation] = useState(null);
  const [feedbackDraftByMessage, setFeedbackDraftByMessage] = useState({});
  const [submittedFeedbackByMessage, setSubmittedFeedbackByMessage] = useState({});
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const audioInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);
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
    const sent = onSendMessage(event, pendingAttachments);
    if (!sent) {
      return;
    }

    setPendingAttachments([]);
    resetFileInputs();
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        {messages.map((message, messageIndex) => (
          <div key={messageIndex} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] flex gap-4 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                  message.role === 'user' ? 'bg-indigo-600' : 'bg-slate-800'
                }`}
              >
                {message.role === 'user' ? (
                  <User size={20} className="text-white" />
                ) : (
                  <Zap size={20} className="text-indigo-400" />
                )}
              </div>
              <div className="space-y-2">
                {message.role === 'assistant' && submittedFeedbackByMessage[messageIndex] && (
                  <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                    <CheckCircle2 size={12} />
                    {submittedFeedbackByMessage[messageIndex].sentiment === 'up' ? 'Helpful feedback saved' : 'Correction feedback saved'}
                  </div>
                )}
                <div
                  className={`p-5 rounded-2xl shadow-sm border ${
                    message.role === 'user'
                      ? 'bg-indigo-600 text-white border-indigo-500 rounded-tr-none'
                      : 'bg-white text-slate-800 border-slate-200 rounded-tl-none'
                  }`}
                >
                  <p className="text-sm leading-relaxed">{message.content}</p>
                  {message.attachments?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {message.attachments.map((attachment) => (
                        <span
                          key={attachment.id}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider ${
                            message.role === 'user'
                              ? 'bg-indigo-500/80 border-indigo-300 text-indigo-50'
                              : 'bg-slate-50 border-slate-200 text-slate-600'
                          }`}
                        >
                          <Paperclip size={11} /> {attachmentLabel(attachment.kind)} · {attachment.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {message.reasoning && (
                    <ReasoningGraph steps={message.traceSteps} />
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
                              ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
                              : 'bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100/70'
                          }`}
                        >
                          <FileSearch size={12} /> {parseSourceLabel(source)}
                        </button>
                      ))}
                    </div>
                      {activeCitation?.messageIndex === messageIndex && activeSource && (
                        <div className="absolute left-0 right-0 z-20 mt-1 bg-white border border-indigo-100 rounded-2xl shadow-[0_16px_40px_rgba(99,102,241,0.16)] p-4 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-black text-slate-800 tracking-tight">Citation Preview</p>
                            <button
                              type="button"
                              onClick={() => setActiveCitation(null)}
                              className="text-[10px] font-black uppercase text-slate-400 hover:text-slate-600"
                            >
                              Close
                            </button>
                          </div>
                          <p className="text-[11px] font-bold text-slate-500">{activeSource.name}</p>
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-black uppercase tracking-wider">
                            <span className="px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-600">p. {activeSource.page}</span>
                            <span className="px-2 py-0.5 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700">{activeSource.chunkId}</span>
                            <span className="px-2 py-0.5 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700">{activeSource.tokenCount} tokens</span>
                          </div>
                          <p className="text-xs leading-6 text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-3">“{activeSource.snippet}”</p>
                        </div>
                      )}
                    </div>
                  )}

                  {message.role === 'assistant' && (
                    <div className="mt-4 pt-3 border-t border-slate-100/90">
                      {!submittedFeedbackByMessage[messageIndex] && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Human feedback</span>
                          <button
                            type="button"
                            onClick={() => startFeedback(messageIndex, 'up')}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-wider hover:bg-emerald-100 transition-colors"
                          >
                            <ThumbsUp size={12} /> Helpful
                          </button>
                          <button
                            type="button"
                            onClick={() => startFeedback(messageIndex, 'down')}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-[10px] font-black uppercase tracking-wider hover:bg-rose-100 transition-colors"
                          >
                            <ThumbsDown size={12} /> Needs correction
                          </button>
                        </div>
                      )}

                      {feedbackDraftByMessage[messageIndex] && (
                        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                          {feedbackDraftByMessage[messageIndex].sentiment === 'down' && (
                            <div>
                              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Correct source</label>
                              <select
                                value={feedbackDraftByMessage[messageIndex].correctionSource}
                                onChange={(event) => updateFeedback(messageIndex, 'correctionSource', event.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500"
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
                            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Short reason</label>
                            <textarea
                              rows={2}
                              value={feedbackDraftByMessage[messageIndex].reason}
                              onChange={(event) => updateFeedback(messageIndex, 'reason', event.target.value)}
                              placeholder="Why should the answer be improved?"
                              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
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
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[10px] font-black uppercase tracking-wider text-slate-500 hover:bg-slate-100"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => submitFeedback(messageIndex)}
                              disabled={!feedbackDraftByMessage[messageIndex].reason?.trim()}
                              className="px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-600 text-[10px] font-black uppercase tracking-wider text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
              <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
              <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
              <span className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
            </div>
            <span className="text-xs text-slate-400 font-medium uppercase tracking-widest">XRAG analysis in progress...</span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
      <div className="p-4 md:p-6 bg-white border-t border-slate-200">
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

          <div className="rounded-2xl border border-slate-200 bg-slate-50 shadow-inner px-3 py-2">
            {pendingAttachments.length > 0 && (
              <div className="flex flex-wrap gap-2 pb-2.5 mb-2.5 border-b border-slate-200/80">
                {pendingAttachments.map((attachment) => (
                  <span key={attachment.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-600">
                    <Paperclip size={11} />
                    {attachment.name}
                    <span className="text-slate-400">({formatAttachmentSize(attachment.size)})</span>
                    <button
                      type="button"
                      onClick={() => removePendingAttachment(attachment.id)}
                      className="text-slate-400 hover:text-rose-600"
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
                  className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-colors flex items-center justify-center"
                >
                  <Mic size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => openPicker('image')}
                  title="Kép feltöltése"
                  className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-colors flex items-center justify-center"
                >
                  <ImagePlus size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => openPicker('file')}
                  title="Fájl feltöltése"
                  className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-colors flex items-center justify-center"
                >
                  <Paperclip size={14} />
                </button>
              </div>

              <div className="w-px h-6 bg-slate-200 shrink-0"></div>

              <input
                type="text"
                placeholder="Ask the XRAG assistant..."
                className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm text-slate-700 placeholder:text-slate-400 px-1 py-2"
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
              />

              {pendingAttachments.length > 0 && (
                <span className="hidden sm:inline-flex text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-100 border border-indigo-200 rounded-full px-2 py-1 shrink-0">
                  {pendingAttachments.length} selected
                </span>
              )}

              <button
                type="submit"
                className="w-10 h-10 bg-indigo-600 text-white rounded-xl shadow-lg hover:bg-indigo-700 transition-all flex items-center justify-center transition-transform active:scale-95 shrink-0"
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
