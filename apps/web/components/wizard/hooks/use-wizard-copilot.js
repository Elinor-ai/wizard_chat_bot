/**
 * @file use-wizard-copilot.js
 * Custom hook for copilot conversation management.
 * Extracted from use-wizard-controller.js for better modularity.
 */

import { useCallback, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { v4 as uuid } from "uuid";
import { fetchCopilotConversation, sendCopilotAgentMessage } from "../wizard-services";
import {
  loadConversationFromCache,
  saveConversationToCache,
  applyClientMessageIds,
  deriveConversationVersion,
} from "../lib/wizard-conversation-cache";

/**
 * Manage copilot conversation state and mutations.
 *
 * @param {Object} params
 * @param {Object} params.wizardState - Current wizard state
 * @param {Function} params.dispatch - State dispatch function
 * @param {string|null} params.userId - Current user ID
 * @param {boolean} params.isHydrated - Whether hydration is complete
 * @param {Function} params.debug - Debug logging function
 * @returns {Object} Copilot conversation utilities and state
 */
export function useWizardCopilot({
  wizardState,
  dispatch,
  userId,
  isHydrated,
  debug,
}) {
  const jobId = wizardState.jobId;

  // Load conversation from cache on job change
  useEffect(() => {
    if (!jobId) {
      return;
    }
    const cached = loadConversationFromCache(jobId);
    if (
      cached &&
      cached.messages.length > 0 &&
      cached.version > (wizardState.copilotConversationVersion || 0) &&
      wizardState.copilotConversation.length === 0
    ) {
      dispatch({
        type: "SET_COPILOT_CONVERSATION",
        payload: {
          messages: cached.messages,
          version: cached.version,
          source: "cache",
        },
      });
    }
  }, [
    dispatch,
    wizardState.copilotConversation.length,
    wizardState.copilotConversationVersion,
    jobId,
  ]);

  // Save conversation to cache when it changes
  useEffect(() => {
    if (!jobId) {
      return;
    }
    saveConversationToCache(
      jobId,
      wizardState.copilotConversation,
      wizardState.copilotConversationVersion
    );
  }, [
    wizardState.copilotConversation,
    wizardState.copilotConversationVersion,
    jobId,
  ]);

  // Fetch conversation mutation
  const fetchConversationMutation = useMutation({
    mutationFn: async () => {
      if (!jobId) {
        throw new Error("Job ID required to fetch conversation");
      }
      return fetchCopilotConversation({ jobId });
    },
    onSuccess: (data) => {
      const messages = applyClientMessageIds(data?.messages ?? []);
      const version = deriveConversationVersion(messages);
      dispatch({
        type: "SET_COPILOT_CONVERSATION",
        payload: {
          messages,
          version,
          source: "server",
        },
      });
      debug?.("copilot:conversation:loaded", { messageCount: messages.length });
    },
    onError: (error) => {
      debug?.("copilot:conversation:error", { error: error.message });
    },
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({ message, contextFields }) => {
      if (!jobId) {
        throw new Error("Job ID required to send message");
      }
      const clientMessageId = uuid();
      return sendCopilotAgentMessage({
        jobId,
        message,
        contextFields,
        clientMessageId,
      });
    },
    onMutate: async ({ message }) => {
      // Optimistic update - add user message immediately
      const clientMessageId = uuid();
      const optimisticMessage = {
        id: clientMessageId,
        role: "user",
        content: message,
        createdAt: new Date(),
        metadata: { clientMessageId },
      };
      dispatch({
        type: "APPEND_COPILOT_MESSAGE",
        payload: { message: optimisticMessage },
      });
      return { clientMessageId };
    },
    onSuccess: (data) => {
      // Replace optimistic messages with server response
      const messages = applyClientMessageIds(data?.messages ?? []);
      const version = deriveConversationVersion(messages);
      dispatch({
        type: "SET_COPILOT_CONVERSATION",
        payload: {
          messages,
          version,
          source: "server",
        },
      });
      debug?.("copilot:message:sent", { messageCount: messages.length });
    },
    onError: (error, variables, context) => {
      // Remove optimistic message on error
      if (context?.clientMessageId) {
        dispatch({
          type: "REMOVE_COPILOT_MESSAGE",
          payload: { messageId: context.clientMessageId },
        });
      }
      debug?.("copilot:message:error", { error: error.message });
    },
  });

  // Send a message to the copilot
  const sendMessage = useCallback(
    (message, contextFields = {}) => {
      if (!message?.trim()) {
        return;
      }
      sendMessageMutation.mutate({ message, contextFields });
    },
    [sendMessageMutation]
  );

  // Refresh conversation from server
  const refreshConversation = useCallback(() => {
    if (!jobId) {
      return;
    }
    fetchConversationMutation.mutate();
  }, [jobId, fetchConversationMutation]);

  // Clear conversation
  const clearConversation = useCallback(() => {
    dispatch({
      type: "SET_COPILOT_CONVERSATION",
      payload: {
        messages: [],
        version: 0,
        source: "clear",
      },
    });
  }, [dispatch]);

  return {
    // Conversation state
    messages: wizardState.copilotConversation,
    conversationVersion: wizardState.copilotConversationVersion,
    // Actions
    sendMessage,
    refreshConversation,
    clearConversation,
    // Loading states
    isSending: sendMessageMutation.isPending,
    isLoading: fetchConversationMutation.isPending,
    sendError: sendMessageMutation.error,
    loadError: fetchConversationMutation.error,
  };
}
