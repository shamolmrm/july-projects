// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — MessageBus
//  Type-safe, validated message passing between extension contexts
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ExtensionMessage,
  MessageType,
  MessageSource,
  MessageTarget,
  MessageResponse,
  BaseMessage,
} from '@/types/messages.types';
import { isValidExtensionMessage } from '@/shared/utils/validators';
import { generateId } from '@/shared/utils/timing';
import { createLogger } from '@/shared/utils/logger';

const log = createLogger('MessageBus');

type MessageHandler<T extends ExtensionMessage = ExtensionMessage> = (
  message: T,
  sender: chrome.runtime.MessageSender,
) => void | Promise<MessageResponse> | boolean;

/**
 * Type-safe Chrome extension message bus.
 * Wraps chrome.runtime.sendMessage / onMessage with:
 *   - Automatic ID + timestamp injection
 *   - Source tagging
 *   - Payload validation
 *   - Handler registration by type
 */
export class MessageBus {
  private readonly handlers = new Map<MessageType, Set<MessageHandler>>();
  private readonly source: MessageSource;

  constructor(source: MessageSource) {
    this.source = source;
    this.installListener();
  }

  /**
   * Register a handler for a specific message type
   */
  on<T extends ExtensionMessage>(
    type: T['type'],
    handler: MessageHandler<T>,
  ): () => void {
    const key = type as MessageType;
    if (!this.handlers.has(key)) {
      this.handlers.set(key, new Set());
    }
    this.handlers.get(key)!.add(handler as MessageHandler);
    return () => {
      this.handlers.get(key)?.delete(handler as MessageHandler);
    };
  }

  /**
   * Send a message to the extension runtime
   */
  async send<T = unknown>(
    type: MessageType,
    payload?: Record<string, unknown>,
    target?: MessageTarget,
  ): Promise<MessageResponse<T>> {
    const message: BaseMessage & Record<string, unknown> = {
      type,
      id:        generateId(),
      timestamp: Date.now(),
      source:    this.source,
      target,
      ...payload ? { payload } : {},
    };

    try {
      const response = await chrome.runtime.sendMessage(message) as MessageResponse<T>;
      return response ?? { success: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.warn(`Send failed [${type}]: ${error}`);
      return { success: false, error };
    }
  }

  /**
   * Send a message to a specific tab
   */
  async sendToTab<T = unknown>(
    tabId: number,
    type: MessageType,
    payload?: Record<string, unknown>,
  ): Promise<MessageResponse<T>> {
    const message: BaseMessage & Record<string, unknown> = {
      type,
      id:        generateId(),
      timestamp: Date.now(),
      source:    this.source,
      ...payload ? { payload } : {},
    };

    try {
      const response = await chrome.tabs.sendMessage(tabId, message) as MessageResponse<T>;
      return response ?? { success: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.warn(`sendToTab failed [${type}] tab:${tabId}: ${error}`);
      return { success: false, error };
    }
  }

  private installListener(): void {
    chrome.runtime.onMessage.addListener(
      (rawMsg: unknown, sender: chrome.runtime.MessageSender, sendResponse: (r: unknown) => void) => {
        if (!isValidExtensionMessage(rawMsg)) {
          log.warn('Received invalid message, ignoring', rawMsg);
          return false;
        }

        const msg = rawMsg as ExtensionMessage;
        const handlerSet = this.handlers.get(msg.type);
        if (!handlerSet || handlerSet.size === 0) return false;

        let hasAsync = false;
        for (const handler of handlerSet) {
          const result = handler(msg, sender);
          if (result instanceof Promise) {
            hasAsync = true;
            result
              .then(r => sendResponse(r ?? { success: true }))
              .catch(err => sendResponse({ success: false, error: String(err) }));
            break; // Only one async handler per type
          }
          if (result === true) {
            hasAsync = true;
          }
        }

        return hasAsync;
      },
    );
  }
}
